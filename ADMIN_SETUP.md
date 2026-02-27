# Admin Panel Setup Guide

## Backend Setup

1. **Install dependencies:**
   ```bash
   cd D:\Photobooth_BE
   npm install
   ```

2. **Configure environment variables:**
   Copy `.env.example` to `.env` and fill in the values:
   ```bash
   cp .env.example .env
   ```

   Required variables:
   - `PORT` - Server port (default: 3001)
   - `JWT_SECRET` - Secret key for JWT tokens (change this!)
   - `GCS_BUCKET_NAME` - Google Cloud Storage bucket name
   - `GOOGLE_APPLICATION_CREDENTIALS_JSON` - Firebase service account JSON

3. **Create admin user:**
   Run the setup script to create the first admin user:
   ```bash
   npm run setup-admin admin@example.com yourpassword
   ```

4. **Start the server:**
   ```bash
   npm run dev
   ```

## Frontend Setup

1. **Install dependencies:**
   ```bash
   cd d:\Photobooth_FE
   npm install
   ```

2. **Configure environment:**
   The `.env.local` file should already be created with:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:3001
   ```

3. **Start the dev server:**
   ```bash
   npm run dev
   ```

## Accessing the Admin Panel

1. Navigate to: `http://localhost:3000/admin/login`
2. Login with the email and password you created
3. Upload releases from the dashboard at: `http://localhost:3000/admin/dashboard`

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with email/password, returns JWT token
- `POST /api/auth/setup` - Create first admin user (only works if no admins exist)

### Releases (Protected)
- `POST /api/releases` - Upload a new release (requires JWT auth)

### Versions (Public)
- `GET /api/versions/latest?type=msi|vm` - Get latest version
- `GET /api/versions` - Get all versions with pagination
