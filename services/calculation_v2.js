const fs = require('fs');
const path = require('path');
const winstonLogger = require('../utils/logger');

function evaluateV2(req) {
  const { version, type } = req.params;
  const { answers } = req.body;

  // Load version-specific tiered questions
  const questionsData = JSON.parse(
    fs.readFileSync(path.join(__dirname, `../api/${version}/${type}/questions.json`), 'utf8')
  );

  const response = {
    message: `Evaluation for ${type} ${version}`,
    status: 'incomplete',
    next_tier: null,
    result: null
  };

  const { tier_1, tier_2 } = answers || {};

  // Step 1: Evaluate Tier 1 (Social Energy Allocation)
  if (!tier_1) {
    response.next_tier = 'tier_1';
    response.questions = questionsData.tiers.tier_1.questions;
    response.dimensions = questionsData.tiers.tier_1.dimensions;
    return response;
  }

  // Step 2: Evaluate Tier 2 (Talent Orientation Forced Ranking)
  if (!tier_2) {
    response.next_tier = 'tier_2';
    response.questions = questionsData.tiers.tier_2.questions;
    response.dimensions = questionsData.tiers.tier_2.dimensions;
    return response;
  }

  // Step 3: Calculate Category Scores
  const introPct = (tier_1.introvert || 0) / 100;
  const extroPct = (tier_1.extrovert || 0) / 100;

  // tier_2 is an ordered array, e.g., ['karsa', 'cipta', 'rasa']
  const tier2ScoreMap = {};
  if (tier_2.length === 3) {
    tier2ScoreMap[tier_2[0]] = 0.70; // 1st
    tier2ScoreMap[tier_2[1]] = 0.50; // 2nd
    tier2ScoreMap[tier_2[2]] = 0.30; // 3rd
  }

  const karsaPct = tier2ScoreMap['karsa'] || 0;
  const ciptaPct = tier2ScoreMap['cipta'] || 0;
  const rasaPct = tier2ScoreMap['rasa'] || 0;

  // Group mappings:
  // 1. Bekerja Keras (Pekerja Keras) -> Introvert * Karsa
  // 2. Berpikir (Cerdas) -> Introvert * Cipta
  // 3. Berperasaan -> Introvert * Rasa
  // 4. Mempengaruhi (Tegas) -> Extrovert * Karsa
  // 5. Bekerjasama (Gaul) -> Extrovert * Cipta
  // 6. Melayani (Lembut) -> Extrovert * Rasa
  const groups = [
    { no: "1", id: "bekerja_keras", score: introPct * karsaPct },
    { no: "2", id: "berpikir", score: introPct * ciptaPct },
    { no: "3", id: "berperasaan", score: introPct * rasaPct },
    { no: "4", id: "mempengaruhi", score: extroPct * karsaPct },
    { no: "5", id: "bekerjasama", score: extroPct * ciptaPct },
    { no: "6", id: "melayani", score: extroPct * rasaPct },
  ];

  // Rank them from highest score to lowest
  groups.sort((a, b) => b.score - a.score);

  // Assign fixed scores based on rank
  const fixedScores = [90, 75, 60, 45, 30, 15];
  const groupFixedScores = {};
  groups.forEach((g, index) => {
    groupFixedScores[g.no] = fixedScores[index];
  });

  // Step 4: Map fixed scores to the 40 pillars
  const calculationData = JSON.parse(
    fs.readFileSync(path.join(__dirname, `../api/v0.1/${type}/calculation.json`), 'utf8')
  );

  // Find mapping from group 18 to group 6
  const partsKey = type === 'tb40anak' ? 'tb40anak' : 'tb40';
  const pillars18 = calculationData.parts[partsKey].pillars.filter(p => p.pillar.group === "18");
  const map18To6 = {};
  pillars18.forEach(p => {
    const parent6 = p.parents.find(parent => parent.group === "6");
    if (parent6) {
      map18To6[p.pillar.no] = parent6.no;
    }
  });

  const pillars40 = calculationData.parts[partsKey].pillars.filter(p => p.pillar.group === "40");
  
  // Sort by questionIndex to ensure the 40-element array is in the correct order
  pillars40.sort((a, b) => parseInt(a.questionIndex) - parseInt(b.questionIndex));

  const answers40 = pillars40.map(p => {
    const parent18 = p.parents.find(parent => parent.group === "18");
    if (parent18 && map18To6[parent18.no]) {
      const group6No = map18To6[parent18.no];
      return groupFixedScores[group6No] || 0;
    }
    return 0; // fallback if lineage is broken
  });

  // Step 5: Final Result
  response.status = 'complete';
  response.result = {
    ranked_categories: groups.map(g => ({ id: g.id, score: g.score })),
    default_scores: answers40
  };

  return response;
}

module.exports = { evaluateV2 };

