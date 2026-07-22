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
    response.range_labels = processedSchema.tiers.tier_3.range_labels;
    response.halfway_report = {
      completion_percentage: compPct,
      completed_tiers: ['tier_1', 'tier_2'],
      pending_tiers: ['tier_3', 'tier_4'],
      missing_questions: ['tier_3'],
      preliminary_results: calculateInterimResults(tier_1, tier_2, tier_3, type, false) // Progress SVG without text scores
    };
    return response;
  }

  // Generate tier_4 questions if missing in schema (40 pillars)
  if (!processedSchema.tiers.tier_4) {
    processedSchema.tiers.tier_4 = {
      id: "precision_40",
      type: "range_slider",
      title: "Presisi 40 Pilar Bakat",
      description: "Evaluasi presisi penuh untuk 40 pilar bakat."
    };
  }
  if (!processedSchema.tiers.tier_4.questions || processedSchema.tiers.tier_4.questions.length === 0) {
    processedSchema.tiers.tier_4.questions = Array.from({ length: 40 }, (_, i) => {
      const pNo = i + 1;
      return {
        id: `p_${pNo}`,
        pillar_no: `${pNo}`,
        text: `Seberapa kuat dorongan pilar bakat ke-${pNo} dalam aktivitasmu sehari-hari?`,
        text_observer: `Seberapa kuat dorongan pilar bakat ke-${pNo} {{name}} dalam aktivitasnya sehari-hari?`
      };
    });
  }

  // Step 4: Tier 4 Check (Full 40 Precision Mode in 18 Parts)
  const answeredPillarsCount = tier_4 ? Object.keys(tier_4).length : 0;

  if (request_precision || (tier_4 && answeredPillarsCount < 40)) {
    if (answeredPillarsCount < 40) {
      const allTier4Questions = processedSchema.tiers.tier_4.questions;
      // 18 parts across 40 pillars (approx 2 to 3 questions per part)
      const currentPartIndex = Math.min(17, Math.floor((answeredPillarsCount / 40) * 18));
      const partSize = Math.ceil(40 / 18);
      const nextQuestions = allTier4Questions.slice(currentPartIndex * partSize, (currentPartIndex + 1) * partSize);
      const compPct = 75 + Math.round((answeredPillarsCount / 40) * 25);

      response.status = 'incomplete';
      response.next_tier = 'tier_4';
      response.current_part = currentPartIndex + 1;
      response.total_parts = 18;
      response.completed_pillars_count = answeredPillarsCount;
      response.total_pillars_count = 40;
      response.questions = nextQuestions;
      response.range_labels = processedSchema.tiers.tier_4.range_labels;
      response.halfway_report = {
        completion_percentage: compPct,
        completed_tiers: ['tier_1', 'tier_2', 'tier_3'],
        pending_tiers: ['tier_4'],
        missing_questions: ['tier_4'],
        preliminary_results: calculateInterimResults(tier_1, tier_2, tier_3, type, false, tier_4)
      };
      return response;
    }
  }

  // Step 5: Final Evaluation Calculation (Full Completion)
  const finalResults = calculateInterimResults(tier_1, tier_2, tier_3, type, true, tier_4); // Full SVG with text scores

  response.status = 'complete';
  response.next_tier = 'tier_4'; // Opt-in option for precision mode
  response.result = finalResults;
  response.halfway_report = {
    completion_percentage: 100,
    completed_tiers: ['tier_1', 'tier_2', 'tier_3', ...(tier_4 ? ['tier_4'] : [])],
    pending_tiers: [],
    missing_questions: [],
    preliminary_results: finalResults
  };

  return response;
}

function calculateInterimResults(tier1, tier2, tier3, type, showText = true, tier4 = null) {
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

    Object.entries(tier3).forEach(([subKey, val]) => {
      const subNum = parseInt(subKey.replace('sub_', ''));
      if (!isNaN(subNum) && subNum >= 1 && subNum <= 18) {
        const grpNo = Math.ceil(subNum / 3);
        const ratingVal = parseFloat(val);
        // Normalize 0-100 slider or 1-5 rating to adjustment delta
        const normDelta = ratingVal > 5 ? (ratingVal - 50) / 500 : (ratingVal - 3) * 0.05;
        groupAdjustments[grpNo] += normDelta;
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

  const groupFixedScores = {};
  scaledGroups.forEach(g => {
    groupFixedScores[g.no] = g.score;
  });

  // Calculate 18 Sub-Groups scores & rankings
  const subgroupDefinitions = [
    { no: "1", id: "sub_1", name: "Pekerja Keras & Penuntas Tugas", group_id: "bekerja_keras", group_name: "Pekerja Keras", group_no: "1" },
    { no: "2", id: "sub_2", name: "Kedisiplinan & Kepatuhan Aturan", group_id: "bekerja_keras", group_name: "Pekerja Keras", group_no: "1" },
    { no: "3", id: "sub_3", name: "Kerapian & Keteraturan Tata Kelola", group_id: "bekerja_keras", group_name: "Pekerja Keras", group_no: "1" },
    { no: "4", id: "sub_4", name: "Analitis & Berpikir Mendalam", group_id: "berpikir", group_name: "Cerdas", group_no: "2" },
    { no: "5", id: "sub_5", name: "Inovasi Ide & Kreativitas Solusi", group_id: "berpikir", group_name: "Cerdas", group_no: "2" },
    { no: "6", id: "sub_6", name: "Perencanaan Strategis Jangka Panjang", group_id: "berpikir", group_name: "Cerdas", group_no: "2" },
    { no: "7", id: "sub_7", name: "Keyakinan Moral & Prinsip Hidup", group_id: "berperasaan", group_name: "Berperasaan", group_no: "3" },
    { no: "8", id: "sub_8", name: "Kepekaan Empati & Perasaan Sesama", group_id: "berperasaan", group_name: "Berperasaan", group_no: "3" },
    { no: "9", id: "sub_9", name: "Rasa Syukur & Sikap Positif", group_id: "berperasaan", group_name: "Berperasaan", group_no: "3" },
    { no: "10", id: "sub_10", name: "Keberanian Memimpin & Mengambil Keputusan", group_id: "mempengaruhi", group_name: "Tegas", group_no: "4" },
    { no: "11", id: "sub_11", name: "Komunikasi Komunikatif & Persuasi", group_id: "mempengaruhi", group_name: "Tegas", group_no: "4" },
    { no: "12", id: "sub_12", name: "Pengarahan & Kendali Kegiatan", group_id: "mempengaruhi", group_name: "Tegas", group_no: "4" },
    { no: "13", id: "sub_13", name: "Kemampuan Bergaul & Jejaring Sosial", group_id: "bekerjasama", group_name: "Gaul", group_no: "5" },
    { no: "14", id: "sub_14", name: "Kolaborasi & Kerjasama Tim", group_id: "bekerjasama", group_name: "Gaul", group_no: "5" },
    { no: "15", id: "sub_15", name: "Kehangatan Merangkul & Inklusi", group_id: "bekerjasama", group_name: "Gaul", group_no: "5" },
    { no: "16", id: "sub_16", name: "Kerelaan Membantu & Melayani", group_id: "melayani", group_name: "Lembut", group_no: "6" },
    { no: "17", id: "sub_17", name: "Pengayoman & Pembimbingan Sesama", group_id: "melayani", group_name: "Lembut", group_no: "6" },
    { no: "18", id: "sub_18", name: "Keramahan & Kesantunan Menjaga Ketenangan", group_id: "melayani", group_name: "Lembut", group_no: "6" }
  ];

  const calculatedSubgroups18 = subgroupDefinitions.map(sub => {
    const parentBaseScore = groupFixedScores[sub.group_no] || 50;
    let finalScore = parentBaseScore;

    if (tier3 && tier3[sub.id] !== undefined) {
      const val = parseFloat(tier3[sub.id]);
      if (val > 5) {
        finalScore = Math.round(val);
      } else {
        const modifier = (val - 3) * 6;
        finalScore = Math.min(99, Math.max(15, Math.round(parentBaseScore + modifier)));
      }
    }

    return {
      no: sub.no,
      id: sub.id,
      name: sub.name,
      group_id: sub.group_id,
      group_name: sub.group_name,
      rating: tier3 && tier3[sub.id] !== undefined ? tier3[sub.id] : 50,
      score: finalScore
    };
  });

  calculatedSubgroups18.sort((a, b) => b.score - a.score);

  const subgroupScoreMap = {};
  calculatedSubgroups18.forEach(sub => {
    subgroupScoreMap[sub.no] = sub.score;
  });

  // Read calculation data for 40 pillars mapping (Tier 3 adjusts default scores of 40 pillars!)
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
      const pIndex = parseInt(p.questionIndex);
      if (tier4 && (tier4[`p_${pIndex}`] !== undefined || tier4[pIndex] !== undefined)) {
        const directVal = tier4[`p_${pIndex}`] !== undefined ? tier4[`p_${pIndex}`] : tier4[pIndex];
        return Math.min(99, Math.max(1, parseInt(directVal)));
      }

      const parent18No = p.parents.find(parent => parent.group === "18")?.no || "1";
      const baseSubgroupScore = subgroupScoreMap[parent18No] || 50;

      let jitter = Math.floor(Math.sin(pIndex * 99) * 6);
      return Math.min(99, Math.max(1, baseSubgroupScore + jitter));
    });
  } else {
    answers40 = Array(40).fill(50);
  }

  calculatedSubgroups18.sort((a, b) => b.score - a.score);

  const topSubgroups18 = calculatedSubgroups18.slice(0, 5); // Top 5 best
  const weakSubgroups18 = calculatedSubgroups18.slice(-5); // Bottom 5 worst

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
  const highestBahasaHati = bahasaHatiMap[topCategory] || 'Kata-kata Apresiasi';
  const highestGayaBelajar = gayaBelajarMap[topCategory] || 'Visual & Kinestetik';

  const fullBahasaHati = scaledGroups.map(g => ({
    category_id: g.id,
    category_name: g.name,
    bahasa_hati: bahasaHatiMap[g.id],
    score: g.score
  }));

  const fullGayaBelajar = scaledGroups.map(g => ({
    category_id: g.id,
    category_name: g.name,
    gaya_belajar: gayaBelajarMap[g.id],
    score: g.score
  }));

  const svg = generatePreliminarySVG(scaledGroups, panggilan, showText);

  const topCategories = scaledGroups.slice(0, 3);
  const weakCategories = scaledGroups.slice(-3);

  return {
    panggilan,
    highest_bahasa_hati: highestBahasaHati,
    highest_gaya_belajar: highestGayaBelajar,
    bahasa_hati: fullBahasaHati,
    gaya_belajar: fullGayaBelajar,
    top_subgroups_18: topSubgroups18,
    weak_subgroups_18: weakSubgroups18,
    ranked_subgroups_18: calculatedSubgroups18,
    ranked_categories: scaledGroups,
    top_categories: topCategories,
    weak_categories: weakCategories,
    svg,
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
