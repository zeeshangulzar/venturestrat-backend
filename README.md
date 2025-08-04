# Neda Backend

This is the backend service for the Neda platform, built with **Node.js**, **Express**, **Prisma**, and **PostgreSQL**.

## Tech Stack

- **Node.js** – Runtime for server-side JavaScript
- **Express.js** – Web framework for routing and middleware
- **Prisma** – Type-safe ORM for database operations
- **PostgreSQL** – Relational database
- **pnpm** – Fast, disk-efficient package manager
- **TypeScript** – Strongly typed JavaScript

## Setup Instructions

### 1. Clone the Repository

```bash
git clone git@github.com:ikram-akram/neda-backend.git
cd neda-backend
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Configure Environment

Create a `.env` file in the root directory based on `.env.example`:

```bash
cp .env.example .env
```

Then update the following fields:

```ini
DATABASE_URL=postgresql://user:password@localhost:5432/neda
PORT=3001
```

### 4. Setup Prisma

```bash
npx prisma generate
npx prisma migrate dev --name init
```

### 5. Seed the Database

If you have a `prisma/seed.ts` file and want to prepopulate brokers:

```bash
pnpm seed
```

### 6. Run the Server

```bash
pnpm dev
```

The server will be running at: `http://localhost:3001`

## Common Scripts

- `pnpm dev` – Start the development server
- `pnpm build` – Compile TypeScript
- `pnpm start` – Run compiled app
- `pnpm seed` – Seed the database with initial data

## Project Structure

```
prisma/          # Prisma schema and seed file
src/
├── routes/      # Express route handlers
├── controllers/ # Request handlers
├── middlewares/ # Custom middleware
└── index.ts     # Entry point
```

## Notes

- The backend exposes RESTful APIs to be consumed by the Next.js frontend.
- Make sure your database is running locally or remotely before starting the server.

---

Let me know if you'd like to add API documentation or Docker setup instructions later.