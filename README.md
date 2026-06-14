# API TB40 (Tafsir Bakat 40)

API TB40 is a RESTful API service for calculating and analyzing the TB40 (Tafsir Bakat 40) personality assessment test. It provides endpoints for getting test questions and calculating test results, including detailed analysis and visual representations.

## Features

- **Tiered Assessment (v0.2)**: New branching logic reduces user friction by starting with high-level questions before drilling down into specific traits.
- **Multi-Type Assessments**: Supports Adult (`tb40`) and Children (`tb40anak`) versions.
- **Dynamic Calculation**: Automatic scoring, ranking, and trait categorization.
- **Visual Representations**: Generates SVG personality maps based on scores or ranks.
- **Health Monitoring**: Built-in health check endpoint.
- **Production Ready**:
  - Security hardening with `helmet`.
  - Publicly accessible via `cors`.
  - Abuse prevention with `express-rate-limit`.
  - Environment-based configuration with `dotenv`.
  - Structured logging with `winston`.
  - Centralized JSON error handling.
- **Automated Testing**: Comprehensive test suite with Jest.

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

## API Documentation

Interactive documentation is available at `http://localhost:4040/api-docs`.

### Health Check
```bash
GET /health
```
Returns application status, uptime, and timestamp.

### Tiered Evaluation (v0.2)
**Endpoint:** `POST /api/v0.2/:type/evaluate`

Allows multi-step assessment where each step determines the next set of questions.

**Example Payload (Step 1):**
```json
{
  "answers": {}
}
```
**Response:** Returns `next_tier: "tier_1"` with Introvert/Extrovert dimensions.

**Example Payload (Step 2):**
```json
{
  "answers": { "tier_1": 1 }
}
```
**Response:** Returns `next_tier: "tier_2"` with Karsa/Cipta/Rasa dimensions.

**Precision Mode:** Add `"request_precision": true` to any payload to receive the full 40-question precision set.

### Legacy Calculation (v0.1)
**Endpoint:** `POST /api/v0.1/:type/calculation`

**Request Body Format:**
```json
{
  "parts": {
    "umum": {
      "nama": { "lengkap": "Full Name", "panggilan": "Nick Name" },
      "lahir": { "tanggal": "YYYY-MM-DD" },
      "tanggal": "YYYY-MM-DD"
    },
    "tb40anak": [100, 90, ..., 80] // Array of 40 scores (0-100)
  }
}
```

## Development & Testing

### Running Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Directory Structure
```
api-tb40/
├── api/             # Calculation data & assets by version
├── devlog/          # Project evolution tracking
├── middleware/      # Request validation & security
├── routes/          # API endpoints
├── services/        # Core calculation logic
├── utils/           # Helper functions (coloring, rendering, logging)
├── __tests__/       # Automated test suite
└── app.js           # Application entry point
```

## License
[ISC](https://choosealicense.com/licenses/isc/)
