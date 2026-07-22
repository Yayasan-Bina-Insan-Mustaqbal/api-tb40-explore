const fs = require('fs');
const path = require('path');
const winstonLogger = require('../utils/logger');

function interpolateText(text, textObserver, isObserver, subjectName, type) {
  const defaultName = type === 'tb40anak' ? 'Kamu' : 'Anda';
  const name = (subjectName && subjectName.trim()) ? subjectName.trim() : defaultName;

  let template = (isObserver && textObserver) ? textObserver : text;
  if (!template) template = text;

  return template.replace(/\{\{name\}\}/g, name);
}

function processSchemaForUser(schema, isObserver, subjectName, type) {
  const processed = JSON.parse(JSON.stringify(schema));

  if (processed.tiers) {
    Object.keys(processed.tiers).forEach(tierKey => {
      const tier = processed.tiers[tierKey];
      if (tier.questions) {
        tier.questions.forEach(q => {
          q.text = interpolateText(q.text, q.text_observer, isObserver, subjectName, type);
        });
      }
    });
  }

  return processed;
}

function evaluateV3(req) {
  const { version, type } = req.params;
  const { answers, is_anonymous, is_observer, subject_name, request_precision } = req.body || {};

  const schemaPath = path.join(__dirname, `../api/v0.3/${type}/questions.json`);
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema not found for version ${version} and type ${type}`);
  }

  const questionsData = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const processedSchema = processSchemaForUser(questionsData, is_observer, subject_name, type);

  const { tier_1, tier_2, tier_3, tier_4 } = answers || {};

  const response = {
    message: `Evaluation for ${type} ${version}`,
    status: 'incomplete',
    next_tier: null,
    saved: true,
    timestamp: new Date().toISOString(),
    halfway_report: null,
    result: null
  };

  // Step 1: Tier 1 (Social Energy Allocation)
  if (!tier_1) {
    response.next_tier = 'tier_1';
    response.questions = processedSchema.tiers.tier_1.questions;
    response.dimensions = processedSchema.tiers.tier_1.dimensions;
    response.halfway_report = {
      completion_percentage: 0,
      completed_tiers: [],
      pending_tiers: ['tier_1', 'tier_2', 'tier_3', 'tier_4'],
      missing_questions: ['tier_1'],
      preliminary_results: null
    };
    return response;
  }

  // Step 2: Tier 2 (Talent Orientation Forced Ranking)
  if (!tier_2) {
    response.next_tier = 'tier_2';
    response.questions = processedSchema.tiers.tier_2.questions;
    response.dimensions = processedSchema.tiers.tier_2.dimensions;
    response.halfway_report = {
      completion_percentage: 25,
      completed_tiers: ['tier_1'],
      pending_tiers: ['tier_2', 'tier_3', 'tier_4'],
      missing_questions: ['tier_2'],
      preliminary_results: {
        social_energy: tier_1
      }
    };
    return response;
  }

  // Step 3: Tier 3 (18 Sub-Groups Deep-Dive in 6 Parts) - Profile Required Boundary
  // Anonymous / fast-track tests can ONLY proceed through Tier 1 and Tier 2.
  // To unlock Tier 3 and beyond, user MUST provide personal profile data.
  const hasProfile = Boolean(subject_name && subject_name.trim() && !is_anonymous);

  if (is_anonymous || !hasProfile) {
    response.next_tier = 'profile_required';
    response.missing_profile = ['subject_name', 'birth_date_or_age'];
    response.message = 'Lengkapi profil pengguna (nama, usia/tanggal lahir) untuk melanjutkan ke Tier 3.';
    response.halfway_report = {
      completion_percentage: 50,
      completed_tiers: ['tier_1', 'tier_2'],
      pending_tiers: ['profile_required', 'tier_3', 'tier_4'],
      missing_questions: ['profile'],
      preliminary_results: calculateInterimResults(tier_1, tier_2, null, type, false)
    };
    return response;
  }

  const answeredSubgroupsCount = tier_3 ? Object.keys(tier_3).length : 0;

  // If Tier 3 is still incomplete (fewer than 18 sub-groups answered)
  if (answeredSubgroupsCount < 18) {
    const allTier3Questions = processedSchema.tiers.tier_3.questions || [];
    const currentPartIndex = Math.floor(answeredSubgroupsCount / 3);
    const nextQuestions = allTier3Questions.slice(currentPartIndex * 3, (currentPartIndex + 1) * 3);
    const compPct = 50 + Math.round((answeredSubgroupsCount / 18) * 50);

    response.status = 'incomplete';
    response.next_tier = 'tier_3';
    response.current_part = currentPartIndex + 1;
    response.total_parts = 6;
    response.completed_subgroups_count = answeredSubgroupsCount;
    response.total_subgroups_count = 18;
    response.questions = nextQuestions;
    response.scale_options = processedSchema.tiers.tier_3.scale_options;
    response.halfway_report = {
      completion_percentage: compPct,
      completed_tiers: ['tier_1', 'tier_2'],
      pending_tiers: ['tier_3', 'tier_4'],
      missing_questions: ['tier_3'],
      preliminary_results: calculateInterimResults(tier_1, tier_2, tier_3, type, false) // Progress SVG without text scores
    };
    return response;
  }

  // Step 4: Tier 4 Check (Full 40 Precision Mode)
  if (request_precision && !tier_4) {
    response.next_tier = 'tier_4';
    response.questions = processedSchema.tiers.tier_4 ? processedSchema.tiers.tier_4.questions : [];
    response.halfway_report = {
      completion_percentage: 75,
      completed_tiers: ['tier_1', 'tier_2', 'tier_3'],
      pending_tiers: ['tier_4'],
      missing_questions: ['tier_4'],
      preliminary_results: calculateInterimResults(tier_1, tier_2, tier_3, type, false)
    };
    return response;
  }

  // Step 5: Final Evaluation Calculation (Full 100% Completion)
  const finalResults = calculateInterimResults(tier_1, tier_2, tier_3, type, true); // Full SVG with text scores

  response.status = 'complete';
  response.next_tier = 'tier_4'; // Opt-in option for precision mode
  response.result = finalResults;
  response.halfway_report = {
    completion_percentage: 100,
    completed_tiers: ['tier_1', 'tier_2', 'tier_3'],
    pending_tiers: [],
    missing_questions: [],
    preliminary_results: finalResults
  };

  return response;
}

function calculateInterimResults(tier1, tier2, tier3, type, showText = true) {
  const introPct = ((tier1 && tier1.introvert) || 50) / 100;
  const extroPct = ((tier1 && tier1.extrovert) || 50) / 100;

  const tier2ScoreMap = {};
  if (Array.isArray(tier2) && tier2.length === 3) {
    tier2ScoreMap[tier2[0]] = 0.70;
    tier2ScoreMap[tier2[1]] = 0.50;
    tier2ScoreMap[tier2[2]] = 0.30;
  } else {
    tier2ScoreMap['karsa'] = 0.50;
    tier2ScoreMap['cipta'] = 0.50;
    tier2ScoreMap['rasa'] = 0.50;
  }

  const karsaPct = tier2ScoreMap['karsa'] || 0.50;
  const ciptaPct = tier2ScoreMap['cipta'] || 0.50;
  const rasaPct = tier2ScoreMap['rasa'] || 0.50;

  const rawGroups = [
    { no: "1", id: "bekerja_keras", name: "Pekerja Keras", score: introPct * karsaPct },
    { no: "2", id: "berpikir", name: "Cerdas", score: introPct * ciptaPct },
    { no: "3", id: "berperasaan", name: "Berperasaan", score: introPct * rasaPct },
    { no: "4", id: "mempengaruhi", name: "Tegas", score: extroPct * karsaPct },
    { no: "5", id: "bekerjasama", name: "Gaul", score: extroPct * ciptaPct },
    { no: "6", id: "melayani", name: "Lembut", score: extroPct * rasaPct },
  ];

  // Refine group scores if partial/full tier_3 answers are present
  if (tier3 && typeof tier3 === 'object' && Object.keys(tier3).length > 0) {
    const groupAdjustments = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    const groupCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

    Object.entries(tier3).forEach(([subKey, rating]) => {
      const subNum = parseInt(subKey.replace('sub_', ''));
      if (!isNaN(subNum) && subNum >= 1 && subNum <= 18) {
        const grpNo = Math.ceil(subNum / 3);
        groupAdjustments[grpNo] += (rating - 3) * 0.05;
        groupCounts[grpNo]++;
      }
    });

    rawGroups.forEach(g => {
      const grpNo = parseInt(g.no);
      if (groupCounts[grpNo] > 0) {
        const avgAdj = groupAdjustments[grpNo] / groupCounts[grpNo];
        g.score = Math.max(0.01, g.score + avgAdj);
      }
    });
  }

  // Dynamic continuous score scaling (map range to 15..95)
  const maxRaw = Math.max(...rawGroups.map(g => g.score)) || 1;
  const minRaw = Math.min(...rawGroups.map(g => g.score)) || 0;

  const scaledGroups = rawGroups.map(g => {
    let normalized = (g.score - minRaw) / (maxRaw - minRaw || 1);
    let finalScore = Math.round(15 + normalized * 80);
    return {
      no: g.no,
      id: g.id,
      name: g.name,
      raw_score: parseFloat(g.score.toFixed(4)),
      score: finalScore
    };
  });

  scaledGroups.sort((a, b) => b.score - a.score);

  // Group 6 to 18 sub-group mapping & calculation
  const groupFixedScores = {};
  scaledGroups.forEach(g => {
    groupFixedScores[g.no] = g.score;
  });

  // Read calculation data for 40 pillars mapping
  const calcDataPath = path.join(__dirname, `../api/v0.1/${type}/calculation.json`);
  let answers40 = [];
  if (fs.existsSync(calcDataPath)) {
    const calcData = JSON.parse(fs.readFileSync(calcDataPath, 'utf8'));
    const partsKey = type === 'tb40anak' ? 'tb40anak' : 'tb40';
    const pillars18 = calcData.parts[partsKey].pillars.filter(p => p.pillar.group === "18");
    const map18To6 = {};
    pillars18.forEach(p => {
      const parent6 = p.parents.find(parent => parent.group === "6");
      if (parent6) map18To6[p.pillar.no] = parent6.no;
    });

    const pillars40 = calcData.parts[partsKey].pillars.filter(p => p.pillar.group === "40");
    pillars40.sort((a, b) => parseInt(a.questionIndex) - parseInt(b.questionIndex));

    answers40 = pillars40.map(p => {
      const parent18No = p.parents.find(parent => parent.group === "18")?.no;
      const parent6No = parent18No ? map18To6[parent18No] : "1";
      const baseGroupScore = groupFixedScores[parent6No] || 50;

      let jitter = Math.floor(Math.sin(parseInt(p.questionIndex) * 99) * 8);
      return Math.min(99, Math.max(1, baseGroupScore + jitter));
    });
  } else {
    answers40 = Array(40).fill(50);
  }

  // Extract top 3 dominant and bottom 3 weak pillar categories
  const topCategories = scaledGroups.slice(0, 3);
  const weakCategories = scaledGroups.slice(-3);

  // Derive Panggilan, Bahasa Hati, Gaya Belajar & SVG Chart for Step 2+ preliminary results
  const topCategory = scaledGroups[0] ? scaledGroups[0].id : 'bekerja_keras';
  
  const panggilanMap = {
    bekerja_keras: type === 'tb40anak' ? 'Sang Ananda Tangguh & Tekun' : 'Sang Pelaksana Tangguh & Tekun',
    berpikir: type === 'tb40anak' ? 'Sang Ananda Cerdas & Pemikir' : 'Sang Pemikir Cerdas & Analitis',
    berperasaan: type === 'tb40anak' ? 'Sang Ananda Pengayom & Peka' : 'Sang Pengayom & Empatis',
    mempengaruhi: type === 'tb40anak' ? 'Sang Ananda Pemimpin Berani' : 'Sang Pemimpin & Penggerak Tegas',
    bekerjasama: type === 'tb40anak' ? 'Sang Ananda Ceria & Gaul' : 'Sang Sahabat & Penghubung Gaul',
    melayani: type === 'tb40anak' ? 'Sang Ananda Penolong Lembut' : 'Sang Pelayan & Penolong Lembut'
  };

  const bahasaHatiMap = {
    bekerja_keras: 'Pertolongan Nyata & Aksi Nyata (Acts of Service)',
    berpikir: 'Penghargaan atas Gagasan & Ide Kreatif',
    berperasaan: 'Sentuhan Perhatian & Kata-kata Penguatan (Words of Affirmation)',
    mempengaruhi: 'Kepercayaan & Dukungan Kepemimpinan',
    bekerjasama: 'Waktu Bersama & Kebersamaan Berkualitas (Quality Time)',
    melayani: 'Ketulusan Pelayanan & Kepedulian Hati'
  };

  const gayaBelajarMap = {
    bekerja_keras: 'Kinestetik & Eksperimen Langsung (Praktik)',
    berpikir: 'Visual & Analitis (Membaca, Meneliti, & Berpikir Reflektif)',
    berperasaan: 'Auditori & Emosional (Bercerita & Diskusi Peka)',
    mempengaruhi: 'Interaktif & Orientasi Tantangan (Simulasi Kepemimpinan)',
    bekerjasama: 'Auditori & Kolaboratif (Kerja Kelompok & Diskusi Ramai)',
    melayani: 'Kinestetik & Pelayanan Berbagi (Belajar Sambil Membantu)'
  };

  const panggilan = panggilanMap[topCategory] || 'Sang Penjelajah Bakat';
  const bahasaHati = bahasaHatiMap[topCategory] || 'Kata-kata Apresiasi';
  const gayaBelajar = gayaBelajarMap[topCategory] || 'Visual & Kinestetik';

  const svg = generatePreliminarySVG(scaledGroups, panggilan, showText);

  return {
    panggilan,
    bahasa_hati: bahasaHati,
    gaya_belajar: gayaBelajar,
    svg,
    ranked_categories: scaledGroups,
    top_categories: topCategories,
    weak_categories: weakCategories,
    default_scores: answers40
  };
}

function generatePreliminarySVG(scaledGroups, panggilan, showText = true) {
  const bars = scaledGroups.map((g, index) => {
    const y = 60 + index * 40;
    const width = Math.max(20, Math.round((g.score / 100) * 300));
    const textLabel = showText ? `<text x="20" y="${y + 17}" font-family="Arial, sans-serif" font-size="14" fill="#374151">${g.name}</text>` : '';
    const scoreLabel = showText ? `<text x="${160 + width}" y="${y + 17}" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#4F46E5">${g.score}</text>` : '';
    
    return `${textLabel}` +
      `<rect x="${showText ? 150 : 30}" y="${y}" width="${width}" height="24" rx="4" fill="#4F46E5" fill-opacity="${showText ? '1.0' : '0.85'}" />` +
      `${scoreLabel}`;
  }).join('');

  const title = showText ? `Peta Bakat: ${panggilan}` : `Progres Visual Peta Bakat`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 320" width="100%" height="100%">` +
    `<rect width="100%" height="100%" fill="#F9FAFB" rx="8" />` +
    `<text x="250" y="35" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#1F2937">${title}</text>` +
    bars +
    `</svg>`;
}

module.exports = {
  evaluateV3,
  processSchemaForUser
};
