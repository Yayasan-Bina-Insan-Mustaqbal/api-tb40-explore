# API TB40 (Tafsir Bakat 40)

API TB40 is a RESTful API service for calculating and analyzing the TB40 (Tafsir Bakat 40) personality assessment test. It provides endpoints for question schema retrieval, multi-step stateful evaluation, trait scoring, visual report generation, and batch analytics.

## Features

- **Stateful PocketBase Persistence (v0.3)**: Real-time interaction tracking, session recovery, unique submission IDs (`sub_xxxxxxxx`), and optimistic concurrency control.
- **Automatic Age Detection (v0.3)**: Calculates user age from birthdate (`birth_date` or `age`). Automatically selects `"tb40anak"` for age < 15 and `"tb40"` for age ≥ 15.
- **4-Tier Adaptive Progression Engine (v0.3)**:
  - **Tier 1**: Social Energy Allocation (Introvert vs Extrovert).
  - **Tier 2**: Talent Orientation Forced Ranking (Karsa ⚡, Cipta 💡, Rasa ❤️).
  - **Tier 3**: 18 Sub-Group 5-Point Likert Scale Deep-Dive (*Sangat Tidak Setuju* to *Sangat Setuju*).
  - **Tier 4**: Optional 40-Pillar Precision Mode.
- **Fast-Track Anonymous & Profile Boundary (v0.3)**: Users can start assessments blindly and complete Tier 1 and Tier 2 anonymously. Unlocking Tier 3 requires completing profile info (`subject_name`, `birth_date`/`age`) via `PATCH /submissions/:id/profile`.
- **Dynamic Continuous Scoring**: High-resolution continuous probability weighting replacing flat score bands.
- **Observer Mode & Name Personalization**: Assess yourself or observe someone else (`is_observer: true` & `subject_name: "Ahmad"`) with dynamic `{{name}}` template interpolation.
- **Qualitative Slider Range Descriptors & Emojis**: Dynamic human-readable state descriptors with expressive emojis (🤫, 🌿, 🤝, 🎉, 🧠).
- **Real-Time Auto-Save & Halfway Report**: Timestamp confirmation for client auto-saves and partial completion progress auditing.
- **Post-Report Contact Enrichment**: Optional post-report endpoint (`PATCH /submissions/:id/contact`) for attaching email and phone numbers.
- **Organization & Event Analytics**: Link submissions to events/orgs and batch export results.
- **Multi-Demographic Support**: Adult (`tb40`) and Children (`tb40anak`) versions.
- **Production Ready**:
  - Hardened with `helmet`, `cors`, and route-specific `express-rate-limit`.
  - Structured logging with `winston` and JSON error handling.
  - Interactive OpenAPI/Swagger UI documentation.
- **Automated Testing**: 100% passing test coverage with Jest (7 test suites, 35 tests).

---

## Quick Start

### 1. Installation

```bash
git clone https://github.com/decaller/api-tb40.git
cd api-tb40
npm install
```

### 2. Configuration

Copy the example environment file and adjust as needed:
```bash
cp .env.example .env
```

### 3. Start the Server

```bash
npm start
```
The API will be available at `http://localhost:4040`.

---

## API Documentation

Interactive OpenAPI documentation is available at `http://localhost:4040/api-docs`.

### Frontend Integration Guides
- [v0.3 API Frontend Implementation Guide](file:///home/abuhafi/Project/api-tb40-explore/v0.3%20api%20frontend%20implementation.md)
- [v0.2 API Frontend Implementation Guide](file:///home/abuhafi/Project/api-tb40-explore/v0.2%20api%20frontend%20implementation.md)

### Health Check
```bash
GET /health
```
Returns application status, uptime, and timestamp.

---

### v0.3 Stateful Submissions API

#### Initialize Submission (Explicit or Age Auto-Detect)
```bash
POST /api/v0.3/submissions
```
Payload (Auto-Detect Age):
```json
{
  "birth_date": "2015-05-10",
  "is_anonymous": false,
  "is_observer": true,
  "subject_name": "Ahmad",
  "event_id": "event_123"
}
```
Response:
```json
{
  "id": "sub_1784758720942_ozijb",
  "type": "tb40anak",
  "determined_by": "age_detection",
  "detected_age": 11,
  "status": "incomplete",
  "current_tier": "tier_1",
  "saved": true,
  "timestamp": "2026-07-23T05:18:40.956Z"
}
```

#### Debounced Step Evaluation & Auto-Save
```bash
POST /api/v0.3/submissions/:id/evaluate
```
Payload:
```json
{
  "sequence_number": 1,
  "answers": {
    "tier_1": { "introvert": 70, "extrovert": 30 }
  }
}
```

#### Profile Completion (Unlocking Tier 3 for Anonymous Users)
```bash
PATCH /api/v0.3/submissions/:id/profile
```
Payload:
```json
{
  "subject_name": "Ahmad",
  "birth_date": "2015-05-10",
  "is_observer": true
}
```

#### Post-Report Contact Enrichment
```bash
PATCH /api/v0.3/submissions/:id/contact
```
Payload:
```json
{
  "email": "user@example.com",
  "phone": "+6281234567890"
}
```

#### Public Share Result
```bash
GET /api/v0.3/submissions/:id/share
```

---

## Development & Testing

### Running Tests
```bash
# Run all automated tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Directory Structure
```
api-tb40/
├── api/             # Question schemas & calculation rules by version (v0.1, v0.2, v0.3)
├── devlog/          # Architectural evolution logs (devlog 001 - 010)
├── middleware/      # Request validation & security rate-limiters
├── pocketbase/      # PocketBase database schema definitions (pb_schema.json)
├── public/          # Static assets & swagger.yaml OpenAPI spec
├── routes/          # Express API endpoints & submissions router
├── services/        # Calculation engines (v1, v2, v3) & PocketBase client
├── utils/           # Template rendering, color mapping, winston logger
├── __tests__/       # Comprehensive Jest test suite (7 suites, 35 tests)
├── docker-compose.yml
└── app.js           # Express app entry point
```

## License
[ISC](https://choosealicense.com/licenses/isc/)
