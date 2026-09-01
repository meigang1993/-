const fs = require("fs");
const path = require("path");
const espree = require("espree");

const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "src", "original");
const failures = [];
const frequentEvents = new Set(["input", "mousemove", "pointermove", "resize", "scroll", "touchmove"]);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function memberPath(node) {
  if (!node) return "";
  if (node.type === "Identifier") return node.name;
  if (node.type !== "MemberExpression" || node.computed) return "";
  const base = memberPath(node.object);
  return base && node.property.type === "Identifier" ? `${base}.${node.property.name}` : "";
}

function expensiveCall(node) {
  if (node.type !== "CallExpression") return false;
  const name = memberPath(node.callee).replace(/^window\./, "");
  return name === "dzmm.completions" ||
    name === "dzmm.draw.generate" ||
    name === "dzmm.draw.edit" ||
    name === "dzmm.fn.invoke" ||
    name === "dzmm.fn.invokeStream";
}

function callbackOwner(fn, parents) {
  const owner = parents.get(fn);
  return owner?.type === "CallExpression" && owner.arguments.includes(fn) ? owner : null;
}

function ownerRisk(owner) {
  const name = memberPath(owner.callee).replace(/^window\./, "");
  if (name === "setInterval" || name === "requestAnimationFrame") return name;
  if (!name.endsWith("addEventListener")) return "";
  const event = owner.arguments[0];
  return event?.type === "Literal" && frequentEvents.has(event.value) ? `${name}("${event.value}")` : "";
}

function inspect(file) {
  const source = fs.readFileSync(file, "utf8");
  let ast;
  try {
    ast = espree.parse(source, { ecmaVersion: "latest", sourceType: "script", loc: true });
  } catch (error) {
    failures.push(`${path.relative(root, file)}:${error.lineNumber || 1} cannot be risk-scanned: ${error.message}`);
    return;
  }

  const parents = new Map();
  const stack = [{ node: ast, parent: null, functions: [] }];
  while (stack.length) {
    const { node, parent, functions } = stack.pop();
    if (!node || typeof node.type !== "string") continue;
    if (parent) parents.set(node, parent);
    const isFunction = /Function(Expression|Declaration)$/.test(node.type) || node.type === "ArrowFunctionExpression";
    const nextFunctions = isFunction ? functions.concat(node) : functions;

    const pathName = memberPath(node);
    if (pathName === "parent.document" || pathName === "top.document" ||
        pathName === "top.window" || pathName === "window.opener" ||
        pathName === "document.cookie") {
      failures.push(`${path.relative(root, file)}:${node.loc.start.line} uses sandbox-blocked ${pathName}`);
    }
    if (node.type === "Identifier" && (node.name === "sessionStorage" || node.name === "indexedDB")) {
      failures.push(`${path.relative(root, file)}:${node.loc.start.line} uses sandbox-blocked ${node.name}`);
    }
    if (expensiveCall(node)) {
      for (const fn of nextFunctions.slice().reverse()) {
        const owner = callbackOwner(fn, parents);
        const risk = owner && ownerRisk(owner);
        if (risk) {
          failures.push(`${path.relative(root, file)}:${node.loc.start.line} calls a costly SDK API inside ${risk}`);
          break;
        }
        if (owner && expensiveCall(owner)) {
          failures.push(`${path.relative(root, file)}:${node.loc.start.line} recursively calls a costly SDK API from its callback`);
          break;
        }
      }
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        value.slice().reverse().forEach(child => {
          if (child && typeof child.type === "string") stack.push({ node: child, parent: node, functions: nextFunctions });
        });
      } else if (value && typeof value.type === "string") {
        stack.push({ node: value, parent: node, functions: nextFunctions });
      }
    }
  }
}

walk(sourceDir).filter(file => file.endsWith(".js")).forEach(inspect);

if (failures.length) {
  console.error("Runtime risk checks failed:");
  failures.forEach(message => console.error(`- ${message}`));
  process.exit(1);
}

console.log("Runtime risk checks passed: sandbox access and costly SDK loops");
