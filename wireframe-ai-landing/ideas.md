# Wireframe AI Landing Page - Design Brainstorm

## 선택된 디자인 철학: Excalidraw Sketchy Minimalism

### 디자인 무브먼트
**Hand-Drawn Wireframe Aesthetic** - Excalidraw의 손그린 스케치 스타일을 현대적 랜딩페이지에 적용. 완성되지 않은 듯한 진정성과 접근성을 동시에 표현.

### 핵심 원칙
1. **Authentic Imperfection**: 완벽하지 않은 선, 약간 삐뚤빠뚤한 박스 - 로봇이 아닌 인간의 손길 표현
2. **Monochromatic Clarity**: 흑/백/회색만 사용하여 와이어프레임의 본질에 충실. 컬러는 최소화하되 필요시 soft accent만 사용
3. **Sketch-First Mentality**: 모든 UI 요소가 "아직 완성 전" 느낌 - 사용자에게 협력의 느낌 전달
4. **Negative Space Dominance**: 여백을 극적으로 활용하여 각 섹션의 호흡감 확보

### 색상 철학
- **Primary Palette**: 검정(#1a1a1a), 회색(#666666), 밝은 회색(#e8e8e8), 흰색(#ffffff)
- **Accent**: 매우 제한적 - 필요시 soft blue(#4a90e2) 또는 soft gray(#999999)만 사용
- **배경**: 약간의 노트 종이 텍스처 또는 grid 패턴 (매우 subtle)
- **감정**: 신뢰, 명확성, 창의성, 미니멀함

### 레이아웃 패러다임
- **비대칭 구성**: 좌측에 텍스트, 우측에 스케치 일러스트 배치 (또는 반대)
- **Breathing Sections**: 각 섹션 사이 충분한 여백으로 독립성 표현
- **Hand-Drawn Grid**: 완벽한 그리드가 아닌, 손으로 그은 듯한 가이드라인 활용
- **Asymmetric Alignment**: 요소들이 완벽하게 정렬되지 않은 느낌 (하지만 의도적으로)

### 시그니처 요소
1. **Sketchy Boxes**: 모든 버튼, 카드, 섹션 박스는 손그린 테두리 (SVG stroke로 구현)
2. **Hand-Drawn Arrows & Lines**: 프로세스 연결, CTA 강조에 사용
3. **Doodle Icons**: 연필 스케치 스타일의 아이콘 - 완성도 낮지만 친근함

### 인터랙션 철학
- **Subtle Transitions**: 부드러운 fade-in, 약간의 scale 변화
- **Hover Effects**: 마우스 오버 시 스케치 선이 더 진해지거나 약간 움직이는 느낌
- **Playful Micro-interactions**: 클릭 시 작은 스케치 애니메이션 (예: 체크마크 그려지기)

### 애니메이션
- **Entrance**: 요소들이 fade-in되면서 약간의 scale-up (duration: 0.6s, easing: ease-out)
- **Scroll Trigger**: 스크롤할 때 스케치 선이 그려지는 animation (SVG stroke-dasharray 활용)
- **Hover**: 버튼/카드 호버 시 스케치 테두리가 약간 더 진해지고 살짝 움직임
- **No Excessive Motion**: 전체적으로 차분하고 집중력 방해 안 함

### 타이포그래피 시스템
- **Display Font**: "Caveat" (Google Fonts) - 손글씨 스타일, 헤드라인에만 사용
- **Body Font**: "Inter" 또는 "Segoe UI" - 명확하고 읽기 쉬운 sans-serif
- **Hierarchy**:
  - H1: Caveat 48-56px, 검정
  - H2: Caveat 32-40px, 검정
  - H3: Inter 600, 20-24px, 검정
  - Body: Inter 400, 16px, #666666
  - Small: Inter 400, 14px, #999999

---

## 섹션별 구현 계획

### 1. Hero Section
- 큰 Caveat 헤드라인 + 스케치 박스
- 우측에 손그린 와이어프레임 일러스트
- CTA 버튼 (스케치 스타일)
- 배경: 매우 subtle한 grid 패턴

### 2. Features Section (3-4개)
- 각 feature마다 스케치 아이콘 + 제목 + 설명
- 카드 스타일: 손그린 테두리의 박스
- 비대칭 레이아웃으로 배치

### 3. How It Works (3단계)
- 3개의 단계를 손그린 화살표로 연결
- 각 단계마다 숫자 + 제목 + 설명
- 스케치 스타일의 프로세스 다이어그램

### 4. CTA / Pricing Section
- 마지막 강조 섹션
- 큰 CTA 버튼
- 배경: 약간의 스케치 패턴

---

## 기술 구현 노트
- **Sketchy Borders**: CSS `border-radius` 제거 + SVG stroke로 손그린 효과
- **Grid Background**: CSS `background-image` + `linear-gradient` 또는 subtle SVG pattern
- **Hand-Drawn Animation**: Framer Motion으로 stroke-dasharray animation
- **Font Loading**: Google Fonts에서 Caveat + Inter 로드
- **Color Variables**: CSS 변수로 흑/백/회색 정의하여 일관성 유지
