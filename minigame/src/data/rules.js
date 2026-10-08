'use strict';

// Values and sprite sizes come from Entities.lua and the original PNG assets.
const ENTITY_CONFIG = {
  MiniGold: { name: '小金块', mass: 1.6, bonus: 50, width: 10, height: 8, value: 'Normal' },
  NormalGold: { name: '中金块', mass: 2.8, bonus: 100, width: 15, height: 13, value: 'Normal' },
  NormalGoldPlus: { name: '大金块', mass: 4, bonus: 250, width: 20, height: 18, value: 'Normal' },
  BigGold: { name: '巨型金块', mass: 5.6, bonus: 500, width: 32, height: 29, value: 'High' },
  MiniRock: { name: '小石头', mass: 5.5, bonus: 11, width: 15, height: 11, value: 'Low' },
  NormalRock: { name: '石头', mass: 7, bonus: 20, width: 22, height: 19, value: 'Low' },
  BigRock: { name: '大石头', mass: 10, bonus: 100, width: 32, height: 28, value: 'Low' },
  Diamond: { name: '钻石', mass: 1.5, bonus: 600, width: 10, height: 8, value: 'High' },
  QuestionBag: { name: '神秘福袋', mass: 1, bonus: 50, width: 20, height: 23, value: 'Normal' },
  Mole: { name: '鼹鼠', mass: 1.5, bonus: 2, width: 18, height: 13, value: 'Low', mobile: true },
  MoleWithDiamond: { name: '钻石鼹鼠', mass: 1.5, bonus: 602, width: 18, height: 13, value: 'High', mobile: true },
  Skull: { name: '头骨', mass: 2, bonus: 20, width: 18, height: 17, value: 'Low' },
  Bone: { name: '骨头', mass: 3, bonus: 7, width: 20, height: 13, value: 'Low' },
  TNT: { name: '炸药桶', mass: 1, bonus: 2, width: 26, height: 33, value: 'Low' }
};

const SHOP_ITEMS = [
  { id: 'Dynamite', name: '炸药', description: '抓住物品后可以炸掉它，快速收钩。最多携带 12 个。', flag: null },
  { id: 'StrengthDrink', name: '力量药水', description: '下一关回收物品的速度提升 50%。', flag: 'hasStrengthDrink' },
  { id: 'LuckyClover', name: '幸运草', description: '下一关福袋开出力量或炸药的概率翻倍。', flag: 'hasLuckyClover' },
  { id: 'RockCollectorsBook', name: '石头收藏书', description: '下一关石头的售价变为 3 倍。', flag: 'hasRockCollectorsBook' },
  { id: 'GemPolish', name: '钻石抛光液', description: '下一关钻石的售价提升 50%，对钻石鼹鼠也有效。', flag: 'hasGemPolish' }
];

const LEVEL_DURATION = 60;
const BUFF_FLAGS = SHOP_ITEMS.map(item => item.flag).filter(Boolean);

function levelGroup(level) {
  // All ten source groups are reachable; later play cycles through groups 4–10.
  return level <= 10 ? level : 4 + (level - 11) % 7;
}

function goalForLevel(level) {
  const increasing = Math.min(level - 1, 8);
  return 650 + increasing * 275 + 270 * increasing * (increasing + 1) / 2
    + Math.max(0, level - 9) * 2435;
}

module.exports = { ENTITY_CONFIG, SHOP_ITEMS, BUFF_FLAGS, LEVEL_DURATION, levelGroup, goalForLevel };
