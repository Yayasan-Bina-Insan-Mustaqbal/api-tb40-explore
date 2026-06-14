# API TB40 (Tafsir Bakat 40)

API TB40 is a RESTful API service for calculating and analyzing the TB40 (Tafsir Bakat 40) personality assessment test. It provides endpoints for getting test questions and calculating test results, including detailed analysis and visual representations.

## Features

- **Multi-Type Assessments**: Supports Adult (`tb40`) and Children (`tb40anak`) versions.
- **Dynamic Calculation**: Automatic scoring, ranking, and trait categorization.
- **Visual Representations**: Generates SVG personality maps based on scores or ranks.
- **Health Monitoring**: Built-in health check endpoint.
- **Production Ready**:
  - Security hardening with `helmet`.
  - Publicly accessible via `cors`.
  - Abuse prevention with `express-rate-limit`.
  - Environment-based configuration with `dotenv`.
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

### Health Check
```bash
GET /health
```
Returns application status, uptime, and timestamp.

### Get Test Questions
```bash
GET /api/:version/:type/questions.json
```
- `version`: `v0.1`, `v0.2`
- `type`: `tb40` (Adult), `tb40anak` (Children)

### Calculate Results
```bash
POST /api/:version/:type/calculation
```

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
*Note: Use the assessment type as the key for scores (e.g., `tb40anak` or `tb40`).*

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
├── utils/           # Helper functions (coloring, rendering)
├── __tests__/       # Automated test suite
└── app.js           # Application entry point
```

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License
[ISC](https://choosealicense.com/licenses/isc/)
