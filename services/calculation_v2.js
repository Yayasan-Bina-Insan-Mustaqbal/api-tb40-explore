const fs = require('fs');
const path = require('path');
const winstonLogger = require('../utils/logger');

function evaluateV2(req) {
  const { version, type } = req.params;
  const { answers, request_precision } = req.body;

  // Load version-specific tiered questions
  const questionsData = JSON.parse(
    fs.readFileSync(path.join(__dirname, `../api/${version}/${type}/questions.json`), 'utf8')
  );

  // Load original calculation data for pillar metadata and final results
  const calculationData = JSON.parse(
    fs.readFileSync(path.join(__dirname, `../api/v0.1/${type}/calculation.json`), 'utf8')
  );

  const response = {
    message: `Evaluation for ${type} ${version}`,
    status: 'incomplete',
    next_tier: null,
    result: null
  };

  const { tier_1, tier_2, tier_3 } = answers || {};

  // Step 1: Evaluate Tier 1 (Introvert vs Extrovert)
  if (!tier_1) {
    response.next_tier = 'tier_1';
    return response;
  }

  // Step 2: Evaluate Tier 2 (Karsa vs Cipta vs Rasa)
  if (!tier_2) {
    response.next_tier = 'tier_2';
    return response;
  }

  // Step 3: Determine Group 6 mapping
  const groupKey = `${tier_2}_${tier_1}`;
  const groupInfo = questionsData.tiers.tier_3.mapping[groupKey];

  if (!groupInfo) {
    throw new Error(`Invalid tier combination: ${groupKey}`);
  }

  // Step 4: Handle Precision Request (Tier 4)
  if (request_precision) {
    response.status = 'precision_requested';
    response.next_tier = 'tier_4';
    response.questions = JSON.parse(
        fs.readFileSync(path.join(__dirname, `../api/v0.1/${type}/questions.json`), 'utf8')
    ).parts[type === 'tb40anak' ? 'tb40anak' : 'tb40Dewasa'].questions;
    return response;
  }

  // Step 5: Evaluate Tier 3 (Group Specific)
  if (!tier_3 || Object.keys(tier_3).length < groupInfo.questions.length) {
    response.status = 'analyzing';
    response.next_tier = 'tier_3';
    response.group = groupInfo;
    
    // Filter questions for this specific group
    const allQuestions = JSON.parse(
        fs.readFileSync(path.join(__dirname, `../api/v0.1/${type}/questions.json`), 'utf8')
    ).parts[type === 'tb40anak' ? 'tb40anak' : 'tb40Dewasa'].questions;

    response.questions = allQuestions.filter(q => 
        groupInfo.questions.includes(`q${q.index}`)
    );
    
    return response;
  }

  // Step 6: Final Result (Complete)
  response.status = 'complete';
  response.result = {
    primary_group: groupInfo.label,
    description: `Berdasarkan jawabanmu, kamu termasuk tipe ${groupInfo.label}.`,
    traits: groupInfo.questions.map(qId => {
        const index = qId.replace('q', '');
        return calculationData.parts.tb40.pillars.find(p => p.pillar.group === "40" && p.questionIndex == index);
    })
  };

  return response;
}

module.exports = { evaluateV2 };
