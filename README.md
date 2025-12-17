# Neda Backend

This is the backend service for the Neda platform, built with **Node.js**, **Express**, **Prisma**, and **PostgreSQL**.

## Tech Stack

- **Node.js** – Runtime for server-side JavaScript
- **Express.js** – Web framework for routing and middleware
- **Prisma** – Type-safe ORM for database operations
- **PostgreSQL** – Relational database
- **pnpm** – Fast, disk-efficient package manager
- **TypeScript** – Strongly typed JavaScript
- **Clerk** – Authentication and user management
- **Svix** – Webhook verification

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

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Then update the following fields:

```ini
DATABASE_URL=postgresql://user:password@localhost:5432/neda
PORT=3001

# Clerk Configuration
CLERK_WEBHOOK_SECRET=whsec_your_webhook_secret_here
CLERK_SECRET_KEY=sk_test_your_secret_key_here

# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_or_test_key_from_stripe
STRIPE_FREE_PRICE_ID=price_id_for_free_plan
STRIPE_PRO_PRICE_ID=price_id_for_premium_plan
STRIPE_SCALE_PRICE_ID=price_id_for_exclusive_plan
```

### 4. Setup Clerk Webhooks

To automatically sync users between Clerk and your database:

1. Go to your [Clerk Dashboard](https://dashboard.clerk.com/)
2. Navigate to **Webhooks** in the sidebar
3. Click **Add Endpoint**
4. Set the **Endpoint URL** to: `https://your-domain.com/api/webhooks/clerk`
5. Select the following events:
   - `user.created`
   - `user.updated` 
   - `user.deleted`
6. Copy the **Signing Secret** and add it to your `.env` file as `CLERK_WEBHOOK_SECRET`

### 5. Setup Prisma

```bash
npx prisma generate
npx prisma migrate dev --name init
```

### 6. Seed the Database

If you have a `prisma/seed.ts` file and want to prepopulate brokers:

```bash
pnpm seed
```

### 7. Run the Server

```bash
pnpm dev
```

The server will be running at: `http://localhost:3001`

## Common Scripts

- `pnpm dev` – Start the development server
- `pnpm build` – Compile TypeScript
- `pnpm start` – Run compiled app
- `pnpm seed` – Seed the database with initial data
- `pnpm test:webhook` – Test the Clerk webhook endpoint

## Project Structure

```
prisma/          # Prisma schema and seed file
src/
├── routes/      # Express route handlers
│   ├── investor.ts
│   ├── user.ts
│   ├── shortlist.ts
│   └── webhooks.ts  # Clerk webhook handlers
├── controllers/ # Request handlers
├── middlewares/ # Custom middleware
└── index.ts     # Entry point
```

## API Endpoints

### User Management
- `POST /api/webhooks/clerk` - Clerk webhook endpoint for user sync
- `GET /api/user/:userId` - Get user details by ID with shortlisted investors
- `PUT /api/user/:userId` - Update user information
- `POST /api/createOrFindUser` - Create or find existing user
- `GET /api/user/:userId/subscription` - Retrieve Stripe subscription metadata
- `POST /api/user/:userId/subscription` - Change the active subscription plan (requires plan + optional payment method ID)
- `POST /api/user/:userId/subscription/intent` - Create a Stripe Setup Intent to collect a payment method

### Shortlist Management  
- `POST /api/shortlist` - Add investor to user's shortlist
- `GET /api/shortlists/:userId` - Get user's shortlisted investors

### Investor Management
- Various investor-related endpoints

## Notes

- The backend exposes RESTful APIs to be consumed by the Next.js frontend.
- Make sure your database is running locally or remotely before starting the server.
- Clerk webhooks automatically sync user creation/deletion between Clerk and your local database.
- Webhook signatures are verified using Svix for security.
- Users now include firstname, lastname, and publicMetaData fields from Clerk.
- Stripe customers and subscriptions are provisioned automatically on signup; set the Stripe environment variables before onboarding users.

---

Let me know if you'd like to add API documentation or Docker setup instructions later.
