# Project Conventions

## Development Approach
- **Plan in incrementally verifiable chunks**: Break down all plans into small, testable increments that can be implemented and verified sequentially
- Each chunk should produce observable progress - a passing test, working feature, or verifiable output
- Implement in a TDD style: define the expected behavior first, then implement to pass tests
- **Prioritize functional programming**: Favor pure functions, immutability, and composition over stateful operations
- Use TypeScript with strict mode enabled for all new code

## Code Style & Testing
- **Unit testing is mandatory**: Every public function or module must have corresponding unit tests
- Tests should cover happy paths, edge cases, and error conditions
- Aim for meaningful test coverage, not just line count
- Use a testing framework appropriate to the language (Jest, Vitest, pytest, etc.)
- Run tests locally before committing or pushing changes

## Directory Structure
- `/src` - Application code
- `/tests` - Test files
- `/docs` - Documentation

## Build Commands
```bash
npm install      # Install dependencies
npm test         # Run tests and linting
npm run build    # Build for production
```

## Safety Rules
- Always run tests before committing
- Run tests locally before completing work
- Update documentation when adding features
- Never commit credentials or API keys

## Preferences
- Prefer composition over inheritance
- Use functional programming patterns where appropriate (e.g., map/filter/reduce, avoid side effects)
- Write clear commit messages with conventional commits
- Prefer small, focused change sets that implement one verifiable chunk