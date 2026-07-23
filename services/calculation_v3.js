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
    const interim = calculateInterimResults(tier_1, tier_2, tier_3, type, false);
    const rankedCategories = interim?.ranked_categories || [];

    const categorySubgroupMap = {
      "1": ["sub_1", "sub_2", "sub_3"],
      "2": ["sub_4", "sub_5", "sub_6"],
      "3": ["sub_7", "sub_8", "sub_9"],
      "4": ["sub_10", "sub_11", "sub_12"],
      "5": ["sub_13", "sub_14", "sub_15"],
      "6": ["sub_16", "sub_17", "sub_18"]
    };

    const allTier3Questions = processedSchema.tiers.tier_3.questions || [];
    const questionsMap = {};
    allTier3Questions.forEach(q => { questionsMap[q.id] = q; });

    const currentPartIndex = Math.min(5, Math.floor(answeredSubgroupsCount / 3));
    const targetCategory = rankedCategories[currentPartIndex] || { no: "1", name: "Bekerja Keras", score: 50 };
    const targetSubgroupIds = categorySubgroupMap[targetCategory.no] || ["sub_1", "sub_2", "sub_3"];

    const nextQuestions = targetSubgroupIds.map(subId => {
      const q = questionsMap[subId] || { id: subId, text: `Indikator ${subId}` };
      return {
        ...q,
        default_value: targetCategory.score
      };
    });

    const compPct = 50 + Math.round((answeredSubgroupsCount / 18) * 30);

    response.status = 'incomplete';
    response.next_tier = 'tier_3';
    response.current_part = currentPartIndex + 1;
    response.total_parts = 6;
    response.part_title = `Pendalaman Indikator Bakat (${targetCategory.name})`;
    response.completed_subgroups_count = answeredSubgroupsCount;
    response.total_subgroups_count = 18;
    response.questions = nextQuestions;
    response.range_labels = processedSchema.tiers.tier_3.range_labels;
    response.halfway_report = {
      completion_percentage: compPct,
      completed_tiers: ['tier_1', 'tier_2'],
      pending_tiers: ['tier_3', 'tier_4'],
      missing_questions: ['tier_3'],
      preliminary_results: interim
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

  // Step 4: Tier 4 Check (Full 40 Precision Mode in 18 Rounds ordered by Sub-Group Strength)
  const answeredPillarsCount = tier_4 ? Object.keys(tier_4).length : 0;

  if (request_precision || (tier_4 && answeredPillarsCount < 40)) {
    if (answeredPillarsCount < 40) {
      const interim = calculateInterimResults(tier_1, tier_2, tier_3, type, false, tier_4);
      const rankedSubgroups = interim?.ranked_subgroups_18 || [];
      const currentRoundIndex = Math.min(17, Math.floor((answeredPillarsCount / 40) * 18));
      const targetSubgroup = rankedSubgroups[currentRoundIndex] || { no: "1", name: "Penuntas Tugas", score: 50 };

      const allTier4Questions = processedSchema.tiers.tier_4.questions || [];
      let rawNextQuestions = allTier4Questions.filter(q => String(q.subgroup_no) === String(targetSubgroup.no));
      if (!rawNextQuestions || rawNextQuestions.length === 0) {
        const partSize = Math.ceil(40 / 18);
        rawNextQuestions = allTier4Questions.slice(currentRoundIndex * partSize, (currentRoundIndex + 1) * partSize);
      }

      const nextQuestions = rawNextQuestions.map(q => ({
        ...q,
        default_value: targetSubgroup.score
      }));

      const compPct = 80 + Math.round((answeredPillarsCount / 40) * 20);

      response.status = 'incomplete';
      response.next_tier = 'tier_4';
      response.current_part = currentRoundIndex + 1;
      response.total_parts = 18;
      response.part_title = `Evaluasi Presisi Bakat (${targetSubgroup.name})`;
      response.completed_pillars_count = answeredPillarsCount;
      response.total_pillars_count = 40;
      response.questions = nextQuestions;
      response.range_labels = processedSchema.tiers.tier_4.range_labels;
      response.halfway_report = {
        completion_percentage: compPct,
        completed_tiers: ['tier_1', 'tier_2', 'tier_3'],
        pending_tiers: ['tier_4'],
        missing_questions: ['tier_4'],
        preliminary_results: interim
      };
      return response;
    }
  }

  // Step 5: Final Evaluation Calculation (Tier 3 Standard Complete / Tier 4 Precision Complete)
  const isPrecisionComplete = Boolean(tier_4 && answeredPillarsCount === 40);
  const finalResults = calculateInterimResults(tier_1, tier_2, tier_3, type, true, tier_4); // Full SVG with text scores

  response.status = 'complete';
  response.next_tier = isPrecisionComplete ? 'tier_4' : 'tier_4'; // Opt-in option for precision mode
  response.result = finalResults;
  response.halfway_report = {
    completion_percentage: isPrecisionComplete ? 100 : 80,
    completed_tiers: ['tier_1', 'tier_2', 'tier_3', ...(isPrecisionComplete ? ['tier_4'] : [])],
    pending_tiers: isPrecisionComplete ? [] : ['tier_4'],
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

  function getKekuatanAndColor(score) {
    if (score > 80) return { kekuatan: "Sangat Kuat", color: "rgb(255, 100, 100)" };
    if (score > 60) return { kekuatan: "Kuat", color: "rgb(255, 225, 98)" };
    if (score > 40) return { kekuatan: "Sedang", color: "rgb(145, 196, 131)" };
    if (score > 20) return { kekuatan: "Lemah", color: "rgb(187, 187, 187)" };
    return { kekuatan: "Sangat Lemah", color: "rgb(136, 136, 136)" };
  }

  const scaledGroups = rawGroups.map(g => {
    let normalized = (g.score - minRaw) / (maxRaw - minRaw || 1);
    let finalScore = Math.round(15 + normalized * 80);
    const meta = getKekuatanAndColor(finalScore);
    return {
      no: g.no,
      id: g.id,
      name: g.name,
      raw_score: parseFloat(g.score.toFixed(4)),
      score: finalScore,
      kekuatan: meta.kekuatan,
      color: meta.color
    };
  });

  // Preserve natural group order for actual view
  const actualGroups = [...scaledGroups];

  // Sorted groups for rank view
  const sortedGroups = [...scaledGroups].sort((a, b) => b.score - a.score);

  const groupFixedScores = {};
  sortedGroups.forEach(g => {
    groupFixedScores[g.no] = g.score;
  });

  // Calculate 18 Sub-Groups scores & rankings
  const subgroupDefinitions = [
    { no: "1", id: "sub_1", name: "Berambisi", group_id: "bekerja_keras", group_name: "Pekerja Keras", group_no: "1" },
    { no: "2", id: "sub_2", name: "Berwibawa", group_id: "bekerja_keras", group_name: "Pekerja Keras", group_no: "1" },
    { no: "3", id: "sub_3", name: "Giat bekerja", group_id: "bekerja_keras", group_name: "Pekerja Keras", group_no: "1" },
    { no: "4", id: "sub_4", name: "Suka berpikir imajinatif", group_id: "berpikir", group_name: "Cerdas", group_no: "2" },
    { no: "5", id: "sub_5", name: "Suka berpikir positif", group_id: "berpikir", group_name: "Cerdas", group_no: "2" },
    { no: "6", id: "sub_6", name: "Suka berpikir analitis", group_id: "berpikir", group_name: "Cerdas", group_no: "2" },
    { no: "7", id: "sub_7", name: "Suka apa adanya", group_id: "berperasaan", group_name: "Berperasaan", group_no: "3" },
    { no: "8", id: "sub_8", name: "Pendiam", group_id: "berperasaan", group_name: "Berperasaan", group_no: "3" },
    { no: "9", id: "sub_9", name: "Suka merendah", group_id: "berperasaan", group_name: "Berperasaan", group_no: "3" },
    { no: "10", id: "sub_10", name: "Suka menguasai", group_id: "mempengaruhi", group_name: "Tegas", group_no: "4" },
    { no: "11", id: "sub_11", name: "Suka memotivasi", group_id: "mempengaruhi", group_name: "Tegas", group_no: "4" },
    { no: "12", id: "sub_12", name: "Suka menolong", group_id: "mempengaruhi", group_name: "Tegas", group_no: "4" },
    { no: "13", id: "sub_13", name: "Suka menggunakan hubungan yang ada", group_id: "bekerjasama", group_name: "Gaul", group_no: "5" },
    { no: "14", id: "sub_14", name: "Suka membuat hubungan baru", group_id: "bekerjasama", group_name: "Gaul", group_no: "5" },
    { no: "15", id: "sub_15", name: "Suka mengeratkan hubungan yang sudah ada", group_id: "bekerjasama", group_name: "Gaul", group_no: "5" },
    { no: "16", id: "sub_16", name: "Suka melayani dengan cara memberi", group_id: "melayani", group_name: "Lembut", group_no: "6" },
    { no: "17", id: "sub_17", name: "Suka melayani dengan cara menjaga", group_id: "melayani", group_name: "Lembut", group_no: "6" },
    { no: "18", id: "sub_18", name: "Suka melayani dengan cara mengalah", group_id: "melayani", group_name: "Lembut", group_no: "6" }
  ];

  const calculatedSubgroups18 = subgroupDefinitions.map(sub => {
    const parentBaseScore = groupFixedScores[sub.group_no] || 50;
    let finalScore = parentBaseScore;

    if (tier3 && tier3[`sub_${sub.no}`] !== undefined) {
      const userVal = parseFloat(tier3[`sub_${sub.no}`]);
      const normVal = userVal > 5 ? userVal : userVal * 20;
      finalScore = Math.round(parentBaseScore * 0.4 + normVal * 0.6);
    }
    const finalBoundedScore = Math.min(99, Math.max(1, finalScore));
    const meta = getKekuatanAndColor(finalBoundedScore);
    return {
      no: sub.no,
      id: sub.id,
      name: sub.name,
      group_id: sub.group_id,
      group_name: sub.group_name,
      score: finalBoundedScore,
      kekuatan: meta.kekuatan,
      color: meta.color
    };
  });

  const subgroupScoreMap = {};
  calculatedSubgroups18.forEach(sub => {
    subgroupScoreMap[sub.no] = sub.score;
  });

  // Read calculation data for 40 pillars mapping
  const calcDataPath = path.join(__dirname, `../api/v0.1/${type}/calculation.json`);
  let answers40 = [];
  if (fs.existsSync(calcDataPath)) {
    const calcData = JSON.parse(fs.readFileSync(calcDataPath, 'utf8'));
    const partsKey = (calcData.parts && calcData.parts[type]) ? type : 'tb40';
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

  const topCategory = sortedGroups[0] ? sortedGroups[0].id : 'bekerja_keras';
  
  const panggilanMap = {
    bekerja_keras: type === 'tb40anak' ? 'Sang Ananda Tangguh yang Tekun' : 'Sang Pelaksana Tangguh yang Tekun',
    berpikir: type === 'tb40anak' ? 'Sang Ananda Cerdas yang Pemikir' : 'Sang Pemikir Cerdas yang Analitis',
    berperasaan: type === 'tb40anak' ? 'Sang Ananda Pengayom yang Peka' : 'Sang Pengayom yang Empatis',
    mempengaruhi: type === 'tb40anak' ? 'Sang Ananda Pemimpin yang Berani' : 'Sang Pemimpin yang Tegas',
    bekerjasama: type === 'tb40anak' ? 'Sang Ananda Ceria yang Gaul' : 'Sang Sahabat yang Gaul',
    melayani: type === 'tb40anak' ? 'Sang Ananda Penolong yang Lembut' : 'Sang Pelayan yang Lembut'
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

  const profesiMap = {
    bekerja_keras: ["Pemborong Proyek", "Teknisi Proyek", "Pekerja Lapangan", "Relawan", "Petugas SAR"],
    berpikir: ["Peneliti", "Analis Data", "Perencana Strategis", "Konsultan", "Programmer"],
    berperasaan: ["Konselor Keluarga", "Psikolog", "Pendidik", "Pekerja Sosial", "Penulis"],
    mempengaruhi: ["Manajer / Pemimpin", "Public Speaker", "Pengacara", "Politisi", "Negosiator"],
    bekerjasama: ["Public Relations", "Event Organizer", "HRD / Recruiter", "Community Manager"],
    melayani: ["Pekerja Pelayanan Kesehatan", "Customer Service", "Penyedia Jasa", "Relawan Kemanusiaan"]
  };

  const jurusanMap = {
    bekerja_keras: ["Teknik Sipil", "Teknik Permesinan", "Keperawatan", "Marketing"],
    berpikir: ["Ilmu Komputer", "Sains Data", "Matematika", "Fisika", "Filsafat"],
    berperasaan: ["Psikologi", "Bimbingan Konseling", "Sastra", "Sosiologi"],
    mempengaruhi: ["Hukum", "Ilmu Komunikasi", "Manajemen", "Ilmu Politik"],
    bekerjasama: ["Hubungan Internasional", "Ilmu Komunikasi", "Manajemen SDM"],
    melayani: ["Kesehatan Masyarakat", "Ilmu Keperawatan", "Layanan Sosial"]
  };

  const lalaiWarningMap = {
    bekerja_keras: { nama: "Kasal (malas)", definisi: "Merasa berat dan lamban karena tidak mengoptimalkan dorongan kerja keras.", solusi_perbaiki: "Perbaiki dengan menguatkan tekad dan amanah." },
    berpikir: { nama: "Ahlu Ra'yi (mengandalkan akal berlebih)", definisi: "Mengabaikan intuisi atau perasaan karena terlalu lama menganalisis.", solusi_perbaiki: "Perbaiki dengan menguatkan hikmah dan empati." },
    berperasaan: { nama: "Minder (rendah diri)", definisi: "Merasa kurang percaya diri ketika menghadapi tantangan besar.", solusi_perbaiki: "Perbaiki dengan menguatkan syajaa’ah (keberanian) dan ikhlas." },
    mempengaruhi: { nama: "Istibdad (otoriter)", definisi: "Memaksakan kehendak tanpa mendengar pendapat orang lain.", solusi_perbaiki: "Perbaiki dengan menguatkan syura (musyawarah) dan hilm (kesantunan)." },
    bekerjasama: { nama: "Taratud (bimbang/ragu)", definisi: "Sulit mengambil keputusan karena takut merusak hubungan.", solusi_perbaiki: "Perbaiki dengan menguatkan ketegasan dan keberanian." },
    melayani: { nama: "Khouf (khawatir berlebihan)", definisi: "Mudah cemas dan terlalu mengalah hingga merugikan diri sendiri.", solusi_perbaiki: "Perbaiki dengan menguatkan tawakal dan keteguhan." }
  };

  const lebihWarningMap = {
    bekerja_keras: { nama: "Thama' (serakah/ambisi berlebih)", definisi: "Berlebihan menuntut hasil tanpa memperhatikan batas kemampuan.", solusi_perbaiki: "Perbaiki dengan menguatkan qanaa'ah (merasa cukup) dan tawaadhu'." },
    berpikir: { nama: "Jahl (kebodohan merasa paling paham)", definisi: "Merasa paling mengerti sehingga mengabaikan fakta di luar gagasannya.", solusi_perbaiki: "Perbaiki dengan menguatkan sikap belajar dan mendengar." },
    berperasaan: { nama: "Hazan (kesedihan berlarut)", definisi: "Terlalu membawa perasaan mendalam sehingga menghambat aksi nyata.", solusi_perbaiki: "Perbaiki dengan menguatkan aksi nyata dan semangat bergerak." },
    mempengaruhi: { nama: "Kibr (sombong)", definisi: "Merasa lebih unggul dan meremehkan peran orang lain.", solusi_perbaiki: "Perbaiki dengan menguatkan tawadhu' dan merendah." },
    bekerjasama: { nama: "Riya' / Ikut-ikutan", definisi: "Hanya mengikuti suara terbanyak tanpa prinsip yang kuat.", solusi_perbaiki: "Perbaiki dengan menguatkan prinsip moral dan integritas." },
    melayani: { nama: "Dhaf (kelemahan tegas)", definisi: "Sangat mudah mengalah hingga membiarkan kesalahan terjadi.", solusi_perbaiki: "Perbaiki dengan menguatkan keadilan dan kebenaran." }
  };

  const gayaBelajarArabMap = {
    bekerja_keras: 'Al Fuad (الفُؤَاد) - Kinestetik',
    berpikir: 'Al Bashar (البَصَر) - Visual',
    berperasaan: 'As Sam\'u (السَمْع) - Auditori',
    mempengaruhi: 'Al Fuad & Al Bashar - Interaktif',
    bekerjasama: 'As Sam\'u & Al Bashar - Kolaboratif',
    melayani: 'Al Fuad & As Sam\'u - Kinestetik-Melayani'
  };

  const gayaBelajarTempatMap = {
    bekerja_keras: 'Tempat belajar yang nyaman: di alam terbuka, lapangan, bengkel, atau lokasi yang memungkinkan banyak gerakan.',
    berpikir: 'Tempat belajar yang nyaman: memiliki penerangan cukup, tenang, dan pemandangan visual di sekitar tampak menarik.',
    berperasaan: 'Tempat belajar yang nyaman: suasananya hening, tenang, dan bebas dari suara gaduh atau berisik.',
    mempengaruhi: 'Tempat belajar yang nyaman: panggung simulasi, forum diskusi, atau ruang interaksi kelompok.',
    bekerjasama: 'Tempat belajar yang nyaman: ruang belajar kelompok, ruang diskusi interaktif, atau tempat kumpul bersama.',
    melayani: 'Tempat belajar yang nyaman: lingkungan pelayanan sosial, panti/lembaga, atau aktivitas peragaan membantu sesama.'
  };

  const julukan = sortedGroups.length >= 2 ? `'${sortedGroups[0].name} yang ${sortedGroups[1].name}'` : `'${sortedGroups[0]?.name || 'Pekerja Keras'}'`;
  const panggilan = julukan; // Unified persona title
  const highestBahasaHati = bahasaHatiMap[topCategory] || 'Kata-kata Apresiasi';
  const highestGayaBelajar = gayaBelajarMap[topCategory] || 'Visual & Kinestetik';
  const highestGayaBelajarArab = gayaBelajarArabMap[topCategory] || 'Al Fuad (الفُؤَاد)';
  const highestGayaBelajarTempat = gayaBelajarTempatMap[topCategory] || 'Tempat belajar yang tenang dan nyaman.';

  const fullBahasaHati = sortedGroups.map(g => ({
    category_id: g.id,
    category_name: g.name,
    bahasa_hati: bahasaHatiMap[g.id],
    score: g.score
  }));

  const fullGayaBelajar = sortedGroups.map(g => ({
    category_id: g.id,
    category_name: g.name,
    gaya_belajar: gayaBelajarMap[g.id],
    score: g.score
  }));

  // Dual SVG visual charts
  const svgActual = generatePreliminarySVG(actualGroups, panggilan, showText, 'actual');
  const svgRanked = generatePreliminarySVG(sortedGroups, panggilan, showText, 'ranked');

  const topCategories = sortedGroups.slice(0, 3);
  const weakCategories = sortedGroups.slice(-3);

  // Recommendations
  const recommendedProfesi = Array.from(new Set(topCategories.flatMap(g => profesiMap[g.id] || [])));
  const recommendedJurusan = Array.from(new Set(topCategories.flatMap(g => jurusanMap[g.id] || [])));

  // Ego Warning (Extreme Introvert / Extrovert > 75%)
  let egoWarning = null;
  const introVal = (tier1 && tier1.introvert !== undefined) ? tier1.introvert : 50;
  const extroVal = (tier1 && tier1.extrovert !== undefined) ? tier1.extrovert : 50;

  if (introVal >= 75) {
    egoWarning = {
      type: 'introvert_extreme',
      title: 'Dominansi Energi Introvert Sangat Tinggi',
      definisi: 'Cenderung terlalu banyak menarik diri dari pergaulan dan memendam pemikiran sendiri.',
      solusi_perbaiki: 'Perbaiki dengan melatih keterbukaan (Ulfah) dan kebersamaan (Ta\'aawun).'
    };
  } else if (extroVal >= 75) {
    egoWarning = {
      type: 'extrovert_extreme',
      title: 'Dominansi Energi Extrovert Sangat Tinggi',
      definisi: 'Sangat tergantung pada suasana luar dan mudah gelisah jika berada dalam keheningan.',
      solusi_perbaiki: 'Perbaiki dengan melatih keheningan (Shamt) dan ketenangan kontemplatif (Anaah).'
    };
  }

  // Narrative Synthesis
  const dominantSocialEnergy = (introVal >= extroVal)
    ? `Introvert (${introVal}%)`
    : `Extrovert (${extroVal}%)`;
  const top2Names = sortedGroups.slice(0, 2).map(g => g.name).join(' dan ');
  const topSubgroupName = topSubgroups18[0] ? topSubgroups18[0].name : '';
  const ringkasanKepribadian = `Memiliki kecenderungan energi sosial ${dominantSocialEnergy}. Bakat dominan paling menonjol pada bidang ${top2Names}${topSubgroupName ? `, dengan sub-kelompok bakat terkuat pada "${topSubgroupName}"` : ''}. Berpotensi tampil optimal dengan julukan ${julukan}.`;

  const lalaiWarnings = topCategories.map(g => ({
    category_id: g.id,
    category_name: g.name,
    ...(lalaiWarningMap[g.id] || {})
  }));

  const lebihWarnings = topCategories.map(g => ({
    category_id: g.id,
    category_name: g.name,
    ...(lebihWarningMap[g.id] || {})
  }));

  return {
    julukan,
    panggilan,
    ringkasan_kepribadian: ringkasanKepribadian,
    ego_warning: egoWarning,
    highest_bahasa_hati: highestBahasaHati,
    highest_gaya_belajar: highestGayaBelajar,
    highest_gaya_belajar_arab: highestGayaBelajarArab,
    highest_gaya_belajar_tempat: highestGayaBelajarTempat,
    bahasa_hati: fullBahasaHati,
    gaya_belajar: fullGayaBelajar,
    top_subgroups_18: topSubgroups18,
    weak_subgroups_18: weakSubgroups18,
    bakat_kekuatan: topSubgroups18,
    bakat_kelemahan: weakSubgroups18,
    ranked_subgroups_18: calculatedSubgroups18,
    ranked_categories: sortedGroups,
    actual_categories: actualGroups,
    top_categories: topCategories,
    weak_categories: weakCategories,
    recommended_profesi: recommendedProfesi,
    recommended_jurusan: recommendedJurusan,
    lalai_warnings: lalaiWarnings,
    lebih_warnings: lebihWarnings,
    svg_actual: svgActual,
    svg_ranked: svgRanked,
    svg: svgRanked,
    default_scores: answers40
  };
}

function generatePreliminarySVG(scaledGroups, panggilan, showText = true, mode = 'ranked') {
  const bars = scaledGroups.map((g, index) => {
    const y = 60 + index * 40;
    const width = Math.max(20, Math.round((g.score / 100) * 300));
    // Category label only (fine-grained pillar names deleted in Tier 2 and Tier 3)
    const textLabel = `<text x="20" y="${y + 17}" font-family="Arial, sans-serif" font-size="14" fill="#374151">${g.name}</text>`;
    const scoreLabel = showText ? `<text x="${160 + width}" y="${y + 17}" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="#4F46E5">${g.score}</text>` : '';
    
    return `${textLabel}` +
      `<rect x="150" y="${y}" width="${width}" height="24" rx="4" fill="#4F46E5" fill-opacity="${showText ? '1.0' : '0.85'}" />` +
      `${scoreLabel}`;
  }).join('');

  const titlePrefix = mode === 'actual' ? 'Peta Bakat (Struktur Alami)' : 'Peta Bakat (Urutan Rangking)';
  const title = showText ? `${titlePrefix}: ${panggilan}` : `Progres Visual Peta Bakat`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 320" width="100%" height="100%">` +
    `<rect width="100%" height="100%" fill="#F9FAFB" rx="8" />` +
    `<text x="250" y="35" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="#1F2937">${title}</text>` +
    bars +
    `</svg>`;
}

module.exports = {
  evaluateV3,
  processSchemaForUser
};
