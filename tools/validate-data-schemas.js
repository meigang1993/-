module.exports = function createDataValidators(Ajv) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const attackTypeSchema = { enum: ["physical", "magic"] };
  const statSchema = {
    type: "object",
    required: ["attack", "magic", "speed", "maxHp", "bloodlust", "handLimit", "drawPerTurn", "initialDraw"],
    additionalProperties: true,
    properties: {
      attack: { type: "number", minimum: 0 },
      magic: { type: "number", minimum: 0 },
      speed: { type: "number", minimum: 0 },
      maxHp: { type: "number", minimum: 1 },
      bloodlust: { type: "number", minimum: 1 },
      handLimit: { type: "number", minimum: 0 },
      drawPerTurn: { type: "number", minimum: 0 },
      initialDraw: { type: "number", minimum: 0 },
    },
  };
  const skillCardSchema = {
    type: "object",
    required: ["name", "type", "text"],
    additionalProperties: true,
    properties: {
      name: { type: "string", minLength: 1 },
      type: { enum: ["slash", "response", "tactic", "consume", "obstacle"] },
      icon: { type: "string", minLength: 1 },
      text: { type: "string", minLength: 2 },
      targetless: { type: "boolean" },
      allyTarget: { type: "boolean" },
      attackType: attackTypeSchema,
    },
  };
  const skillSchema = {
    type: "object",
    required: ["name", "type", "text"],
    additionalProperties: true,
    properties: {
      name: { type: "string", minLength: 1 },
      type: { enum: ["passive", "active", "trigger", "awakening"] },
      icon: { type: "string", minLength: 1 },
      text: { type: "string", minLength: 2 },
      card: skillCardSchema,
    },
  };
  const enemySchema = {
    type: "object",
    required: ["id", "name", "type", "role", "combatRoles", "evaluation", "art", "ai", "hp", "attack", "magic", "speed", "bloodlust", "handLimit", "drawPerTurn", "initialDraw", "skills"],
    additionalProperties: true,
    properties: {
      id: { type: "string", minLength: 1, pattern: "^[a-z0-9_]+$" },
      name: { type: "string", minLength: 1 },
      type: { enum: ["normal", "elite", "boss"] },
      role: { type: "string", minLength: 1 },
      combatRoles: { type: "array", minItems: 1, maxItems: 1, uniqueItems: true, items: { enum: ["输出", "控制", "辅助/续航", "防御/嘲讽", "成长/资源"] } },
      evaluation: { type: "string", minLength: 8 },
      art: { type: "string", minLength: 1 },
      ai: { type: "string", minLength: 1 },
      hp: { type: "number", minimum: 1 },
      attack: { type: "number", minimum: 0 },
      magic: { type: "number", minimum: 0 },
      speed: { type: "number", minimum: 0 },
      bloodlust: { type: "number", minimum: 1 },
      handLimit: { type: "number", minimum: 0 },
      drawPerTurn: { type: "number", minimum: 0 },
      initialDraw: { type: "number", minimum: 0 },
      skills: { type: "array", minItems: 1, items: skillSchema },
    },
  };
  const characterSchema = {
    type: "object",
    required: ["id", "name", "gender", "face", "art", "avatar", "role", "combatRoles", "evaluation", "stats", "skills"],
    additionalProperties: true,
    properties: {
      id: { type: "string", minLength: 1, pattern: "^[a-z0-9_]+$" },
      name: { type: "string", minLength: 1 },
      gender: { enum: ["male", "female"] },
      face: { type: "string", minLength: 1 },
      art: { type: "string", minLength: 1 },
      avatar: { type: "string", minLength: 1 },
      role: { type: "string", minLength: 1 },
      combatRoles: { type: "array", minItems: 1, maxItems: 1, uniqueItems: true, items: { enum: ["输出", "控制", "辅助/续航", "防御/嘲讽", "成长/资源"] } },
      evaluation: { type: "string", minLength: 8 },
      locked: { type: "boolean" },
      unlockCost: { type: "number", minimum: 0 },
      stats: statSchema,
      skills: { type: "array", minItems: 1, items: skillSchema },
    },
  };
  const runtimeCardSchema = {
    type: "object",
    required: ["name", "type", "text", "suit"],
    additionalProperties: true,
    properties: {
      name: { type: "string", minLength: 1 },
      type: { enum: ["slash", "response", "tactic", "consume", "obstacle"] },
      text: { type: "string", minLength: 2 },
      suit: { type: "string", minLength: 1 },
      power: { type: "number", minimum: 0 },
      price: { type: "number", minimum: 0 },
      scale: { anyOf: [{ enum: ["attack", "magic"] }, { type: "null" }] },
      attackType: attackTypeSchema,
    },
  };
  return {
    validateCharacterSchema: ajv.compile(characterSchema),
    validateEnemySchema: ajv.compile(enemySchema),
    validateRuntimeCardSchema: ajv.compile(runtimeCardSchema),
  };
};
