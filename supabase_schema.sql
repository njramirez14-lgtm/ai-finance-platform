-- Schema for AI Finance Platform (Supabase / PostgreSQL)

-- 1. Users table (Optional if using Supabase Auth, but good for internal relations)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Categories table
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT CHECK (type IN ('INCOME', 'EXPENSE')),
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, name)
);

-- 3. Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    amount NUMERIC(12,2) NOT NULL,
    type TEXT CHECK (type IN ('INCOME', 'EXPENSE')),
    description TEXT,
    date DATE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Settings table
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    currency TEXT DEFAULT 'EUR',
    theme TEXT DEFAULT 'system',
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE
);

-- Add helpful indexes
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_categories_user ON categories(user_id);
