"""Create remaining 6 quiz types in the sample folder via ocelot POST /quizzes/collection/quiz."""
import json
import subprocess
import sys

with open('token.json') as f:
    cfg = json.load(f)
TOKEN = cfg['token']
BASE = cfg['apiBaseURL'] + '/api/v3'
FOLDER = cfg['folderId']

def opt(oid, content, is_answer=False):
    return {"option_id": oid, "content": content, "is_answer": is_answer}

QUIZZES = [
    {
        "quiz_type": "SINGLE_SELECT",
        "content": "Python 是哪一年首次發布？",
        "option_type": "ALPHABET",
        "option_list": [
            opt(1, "1985", False),
            opt(2, "1991", True),
            opt(3, "1995", False),
            opt(4, "2000", False),
        ],
    },
    {
        "quiz_type": "MULTIPLE_SELECT",
        "content": "以下哪些是靜態語言？（可複選）",
        "option_type": "ALPHABET",
        "option_list": [
            opt(1, "Rust", True),
            opt(2, "Python", False),
            opt(3, "Go", True),
            opt(4, "JavaScript", False),
        ],
    },
    {
        "quiz_type": "SHORT_ANSWER",
        "content": "REST 全名是什麼？",
        "option_type": "NO_OPTION",
        "option_list": [],
        "short_answer": {
            "answer": "Representational State Transfer",
            "is_ai_answer": False,
        },
    },
    {
        "quiz_type": "SINGLE_POLL",
        "content": "你最喜歡的程式語言？",
        "option_type": "ALPHABET",
        "option_list": [
            opt(1, "Python", False),
            opt(2, "Go", False),
            opt(3, "Rust", False),
            opt(4, "TypeScript", False),
        ],
    },
    {
        "quiz_type": "MULTIPLE_POLL",
        "content": "你平常會使用哪些工具？（可複選）",
        "option_type": "ALPHABET",
        "option_list": [
            opt(1, "VS Code", False),
            opt(2, "Vim", False),
            opt(3, "Emacs", False),
            opt(4, "IntelliJ", False),
        ],
    },
    {
        "quiz_type": "RECORD",
        "content": "請用英文說出你的名字",
        "option_type": "NO_OPTION",
        "option_list": [],
    },
]

results = []
for q in QUIZZES:
    payload = {
        "folder_id": FOLDER,
        "quizzes": [
            {
                "subject": "",
                "country": "",
                "content": q["content"],
                "quiz_type": q["quiz_type"],
                "option_type": q["option_type"],
                "source_type": "IMPORT_CONTENT",
                "option_list": q["option_list"],
                **({"short_answer": q["short_answer"]} if "short_answer" in q else {}),
            }
        ],
    }
    r = subprocess.run(
        [
            "curl", "-s", "-X", "POST",
            "-H", f"Authorization: Bearer {TOKEN}",
            "-H", "Content-Type: application/json",
            f"{BASE}/quizzes/collection/quiz",
            "--data-binary", json.dumps(payload),
        ],
        capture_output=True, text=True,
    )
    try:
        resp = json.loads(r.stdout)
    except json.JSONDecodeError:
        print(f"❌ {q['quiz_type']}: non-JSON response: {r.stdout[:200]}")
        continue
    if isinstance(resp, list) and resp and "id" in resp[0]:
        qid = resp[0]["id"]
        print(f"✅ {q['quiz_type']}: {qid}")
        results.append({"quiz_type": q["quiz_type"], "id": qid})
    else:
        print(f"❌ {q['quiz_type']}: {json.dumps(resp, ensure_ascii=False)[:400]}")

with open('created-quizzes.json', 'w') as f:
    json.dump(results, f, indent=2, ensure_ascii=False)
print(f"\n💾 Saved {len(results)} quiz ids to created-quizzes.json")
