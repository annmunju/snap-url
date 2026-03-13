# archive-url Quick Start

모노레포 구성:
- `backend/`: FastAPI + SQLite
- `frontend/`: Expo(React Native) 앱

## 1) 백엔드 빠른 시작
```bash
cd backend
cp .env.example .env
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

확인:
```bash
curl http://127.0.0.1:3000/health
```
정상 응답:
```json
{"status":"ok"}
```

## 2) 프론트엔드 빠른 시작
권장 환경:
- Node.js `20.19+`
- Expo SDK `54`

```bash
cd frontend
npm install
cp .env.example .env
```

`.env`에서 백엔드 주소 설정:
```env
EXPO_PUBLIC_API_BASE_URL=http://<YOUR_MAC_IP>:3000
```

실행:
```bash
npx expo start -c
```

## 3) 실제 단말기(휴대폰) 확인 방법
1. 휴대폰에 `Expo Go` 설치
2. 휴대폰과 맥을 같은 Wi-Fi에 연결
3. 맥 IP 확인:
```bash
ipconfig getifaddr en0
```
4. `frontend/.env`의 `EXPO_PUBLIC_API_BASE_URL`를 `http://<맥IP>:3000`으로 설정
5. 백엔드 실행(`python run.py`) 상태 유지
6. 프론트 실행(`npx expo start -c`) 후 QR 스캔
7. 휴대폰 브라우저에서 `http://<맥IP>:3000/health`가 열리면 네트워크 연결 정상

## 4) 문서
- 백엔드 API: `docs/backend-async-ingest-spec-v1.md`
- 앱 구현 명세: `docs/app-design-spec.md`
