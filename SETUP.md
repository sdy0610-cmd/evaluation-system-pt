# 다른 컴퓨터에서 실행하기

## 1. 저장소 클론
```bash
git clone https://github.com/sdy0610-cmd/evaluation-system-pt.git
cd evaluation-system-pt
```

## 2. 환경변수 파일 생성
프로젝트 루트에 `.env.local` 파일 생성:
```
VITE_SUPABASE_URL=https://iezgmddstgvtpmuvfscl.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_y7HIlOaGYU-R4fj-W4avJg_roMox7FK
```

## 3. 패키지 설치 및 실행
```bash
npm install
npm run dev
```

브라우저에서 http://localhost:5173 접속

## 배포
- Railway에 GitHub 연결되어 있어 main 브랜치 push 시 자동 배포
- Railway 환경변수에도 위 두 값 동일하게 설정 필요
