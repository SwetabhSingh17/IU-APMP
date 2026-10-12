# Contributing to IU-APMP (Integral University Academic Project Management Portal)

Thank you for considering contributing to the Integral University Academic Project Management Portal (IU-APMP)! Contributions help make IU-APMP more reliable, scalable, and useful for departmental project governance.

---

## 📋 Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Style Guidelines](#code-style-guidelines)
- [Reporting Issues](#reporting-issues)
- [License](#license)

---

## Getting Started

> [!TIP]
> You can use the automated scripts in the `Setup_Assistant` folder to instantly set up your environment, database, and dependencies.

If you prefer to set up manually:

1. **Fork** the repository and clone your fork:
   ```bash
   git clone https://github.com/<your-username>/IU-APMP.git
   cd IU-APMP
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up your environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your local PostgreSQL credentials
   ```

4. **Push the database schema:**
   ```bash
   npm run db:ensure
   ```

5. **Start the dev server:**
   ```bash
   npm run dev
   ```

---

## Development Workflow

1. **Create a feature branch from `main`:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes. Follow the existing code style:**
   - TypeScript strict mode
   - Functional React components with hooks
   - Drizzle ORM for database queries
   - Zod for validation schemas

3. **Run type checking and automated tests before committing:**
   ```bash
   npm run check
   npm test
   ```

4. **Commit with clear, descriptive messages:**
   ```bash
   git commit -m "feat: add student notification preferences"
   ```

5. **Push and open a Pull Request against `main`.**

---

## Code Style Guidelines

- **TypeScript** — All code must be type-safe. Avoid `any`.
- **Components** — Use shadcn/ui primitives from `client/src/components/ui/`.
- **API Routes** — Add modular registrars under `server/routes/` with proper RBAC via `requireRole()` and ownership checks for user-scoped resources.
- **Schema Changes** — Modify `shared/schema.ts` and run `npm run db:ensure`.
- **Naming** — camelCase for variables/functions, PascalCase for components/types.

---

## Reporting Issues

Open an issue with:
- A clear title and description
- Steps to reproduce (if applicable)
- Expected vs. actual behavior
- Screenshots for UI issues

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
