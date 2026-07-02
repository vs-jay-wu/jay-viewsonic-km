// Runtime-injected into Slide Editor page via playwright-cli eval:
// 1. Fetch my 7 quizzes from Quiz Collection (using page's own auth via credentials)
// 2. Convert Collection Quiz shape → OlfQuizItemViewModel shape (following activityQuiz.mapper.ts:116)
// 3. Call window.__olfActions.setPageType(0, 'quiz', { quizzes, title, source })
// 4. Return status
//
// Prereqs:
//   window.__olfActions must be set (fiber traversal earlier)
//   User must be on a slide editor page

async () => {
  if (!window.__olfActions) {
    return JSON.stringify({ error: 'window.__olfActions not set' });
  }

  const TOKEN = window.__stageToken;
  const BASE = 'https://api-swift.aps1.classswift-stg.com/api/v3';
  const FOLDER = '47e9a247-aa3e-4163-8a40-c3a79ada1d51';

  if (!TOKEN) return JSON.stringify({ error: 'set window.__stageToken first' });

  // Fetch 7 quizzes
  const r = await fetch(
    `${BASE}/quizzes/collection/folder/${FOLDER}/quizzes?page=1&per_page=20&order_by=CREATED_AT&created_at=0`,
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
  const j = await r.json();
  const raw = j.data || [];
  if (!raw.length) return JSON.stringify({ error: 'no quizzes fetched', resp: j });

  // Sort by quiz_type in canonical order (TRUE_FALSE first, RECORD last)
  const ORDER = ['TRUE_FALSE', 'SINGLE_SELECT', 'MULTIPLE_SELECT', 'SHORT_ANSWER', 'SINGLE_POLL', 'MULTIPLE_POLL', 'RECORD'];
  raw.sort((a, b) => ORDER.indexOf(a.quiz_type) - ORDER.indexOf(b.quiz_type));

  // Convert Collection Quiz → OlfQuizItemViewModel
  // (following activityQuiz.mapper.ts:116 quizToOlfQuizItemViewModel)
  const OPTION_TYPE_NO_OPTION = 'NO_OPTION';
  const SOURCE_TYPE_IMPORT_CONTENT = 'IMPORT_CONTENT';

  const quizzes = raw.map((q, idx) => ({
    id: q.id,
    seq: idx + 1,
    content: q.content ?? '',
    quizType: q.quiz_type,
    optionType: q.option_type === OPTION_TYPE_NO_OPTION ? undefined : q.option_type,
    optionList: (q.option_list || []).map((o) => ({
      content: o.content ?? '',
      optionId: o.option_id,
      isAnswer: o.is_answer,
      isAiAnswer: o.is_ai_answer,
    })),
    shortAnswer: q.short_answer
      ? {
          answer: q.short_answer.answer,
          isAiAnswer: q.short_answer.is_ai_answer,
          ...(typeof q.short_answer.reason === 'string' ? { reason: q.short_answer.reason } : {}),
        }
      : null,
    imgUrl: q.img_url,
    sourceType: SOURCE_TYPE_IMPORT_CONTENT,
    standards: q.standards || [],
    subjectId: q.subject_id,
    grade: q.grade,
  }));

  // Get current page 0's existing source (html-activity URL) to preserve
  const vm = window.__olfActions.getLatestViewModel();
  const doc = vm.document || vm;
  const page0 = doc.pages[0];
  const existingSource = page0?.quizContent?.source;

  // Replace page 0 quiz content
  window.__olfActions.setPageType(0, 'quiz', {
    quizzes,
    title: 'mvbf-sample-quiz-fixture',
    ...(existingSource ? { source: existingSource } : {}),
  });

  // Verify
  const vm2 = window.__olfActions.getLatestViewModel();
  const p2 = (vm2.document || vm2).pages[0];
  return JSON.stringify({
    ok: true,
    pageType: p2.pageType,
    injectedCount: p2.quizContent?.quizzes?.length,
    types: p2.quizContent?.quizzes?.map((q) => q.quizType),
  });
};
