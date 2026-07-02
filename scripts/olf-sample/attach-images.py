"""Upload one image per quiz via Hub resources endpoint, then PUT quiz with img_key."""
import json
import mimetypes
import subprocess
import sys
from pathlib import Path

with open('token.json') as f:
    cfg = json.load(f)
TOKEN = cfg['token']
BASE = cfg['apiBaseURL'] + '/api/v3'
ORG = cfg['orgId']
FOLDER = cfg['folderId']

with open('created-quizzes.json') as f:
    quizzes = json.load(f)  # list of {quiz_type, id}


def curl_json(method, url, body=None, extra_headers=None):
    args = ["curl", "-s", "-X", method,
            "-H", f"Authorization: Bearer {TOKEN}",
            "-H", "Content-Type: application/json"]
    if extra_headers:
        for h in extra_headers:
            args += ["-H", h]
    args.append(url)
    if body is not None:
        args += ["--data-binary", json.dumps(body)]
    r = subprocess.run(args, capture_output=True, text=True)
    try:
        return json.loads(r.stdout) if r.stdout else None
    except json.JSONDecodeError:
        return {'raw': r.stdout[:400], 'stderr': r.stderr[:200]}


def curl_put_file(url, file_path, content_type):
    r = subprocess.run(
        ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
         "-X", "PUT",
         "-H", f"Content-Type: {content_type}",
         "--upload-file", file_path,
         url],
        capture_output=True, text=True,
    )
    return r.stdout.strip()


def request_upload_url(file_ext):
    return curl_json("POST", f"{BASE}/quizzes/collection/resources", {
        "type": "img",
        "orgId": ORG,
        "fileExtension": file_ext,
    })


def get_quiz(quiz_id):
    return curl_json("GET", f"{BASE}/quizzes/collection/quiz/{quiz_id}")


def update_quiz(quiz_id, quiz_body):
    return curl_json("PUT", f"{BASE}/quizzes/collection/quiz/{quiz_id}", {"quiz": quiz_body})


for i, q in enumerate(quizzes, 1):
    quiz_type = q['quiz_type']
    quiz_id = q['id']
    img_path = f"/tmp/quiz-img-{i}.png"
    if not Path(img_path).exists():
        print(f"❌ {quiz_type}: image missing at {img_path}")
        continue

    # 1. Ask Hub for upload URL
    upload = request_upload_url("png")
    put_url = upload.get('put') if isinstance(upload, dict) else None
    file_key = (upload.get('file_key') or upload.get('fileKey')) if isinstance(upload, dict) else None
    if not put_url or not file_key:
        print(f"❌ {quiz_type}: upload url request failed: {upload}")
        continue

    # 2. Upload image to S3
    code = curl_put_file(put_url, img_path, "image/png")
    if not code.startswith('20'):
        print(f"❌ {quiz_type}: S3 upload failed http={code}")
        continue

    # 3. Fetch quiz current state
    cur = get_quiz(quiz_id)
    if not cur or 'data' not in cur:
        print(f"❌ {quiz_type}: get failed: {cur}")
        continue
    q_data = cur['data']

    # 4. Build UpdateQuizContent body — QuizCollectionBase
    # Note: server response uses img_url; request expects img_key
    payload = {
        "subject": "",
        "country": "",
        "content": q_data.get('content') or '',
        "img_key": file_key,
        "quiz_type": q_data['quiz_type'],
        "option_type": q_data['option_type'],
        "option_list": q_data.get('option_list') or None,
        "short_answer": q_data.get('short_answer'),
        "ai_short_answer": q_data.get('ai_short_answer'),
        "source_type": q_data.get('source_type', 'IMPORT_CONTENT'),
        "chirp_id": q_data.get('chirp_id'),
    }
    # subject/country must remain empty for IMPORT_CONTENT/MANUAL (validator)
    upd = update_quiz(quiz_id, payload)
    if upd and 'data' in upd:
        print(f"✅ {quiz_type}: img_key={file_key[:40]}...")
    else:
        print(f"❌ {quiz_type}: update failed: {json.dumps(upd, ensure_ascii=False)[:300]}")
