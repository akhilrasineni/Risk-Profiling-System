# Running the AI Portfolio System Locally

This guide will walk you through setting up and running this application on your local machine using VS Code.

## Prerequisites

Before you begin, ensure you have the following installed on your machine:
1. **Node.js** (v18 or higher) - [Download here](https://nodejs.org/)
2. **VS Code** - [Download here](https://code.visualstudio.com/)
3. **Git** - [Download here](https://git-scm.com/)

---

## Step 1: Download the Code

1. In the AI Studio interface, look for the **Download** or **Export** button (usually near the top right or in a menu) to download the project files as a `.zip`.
2. Extract the `.zip` file to a folder on your computer (e.g., `Documents/ai-portfolio-system`).
3. Open **VS Code**.
4. Go to `File` > `Open Folder...` and select the folder you just extracted.

---

## Step 2: Install Dependencies

1. In VS Code, open the integrated terminal by going to `Terminal` > `New Terminal` (or pressing `` Ctrl + ` ``).
2. Run the following command to install all required packages:
   ```bash
   npm install
   ```

---

## Step 3: Set Up Environment Variables

The app needs to connect to your Supabase database and the Gemini AI API. 

1. In the root folder of your project, create a new file named exactly `.env`.
2. Copy the following template into your new `.env` file:

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Google Gemini AI Configuration
GEMINI_API_KEY=your_gemini_api_key_here
```

3. Replace the placeholder values with your actual keys:
   - **Supabase Keys:** Go to your Supabase Dashboard > Project Settings > API.
   - **Gemini Key:** Go to [Google AI Studio](https://aistudio.google.com/app/apikey) to generate an API key.

---

## Step 4: Start the Development Server

1. In your VS Code terminal, run the following command:
   ```bash
   npm run dev
   ```
2. You should see output indicating the server has started, usually looking like this:
   ```
   Server running on http://localhost:3000
   ```
3. Open your web browser and navigate to `http://localhost:3000`.

---

## Step 5: Testing the Application

To test the application, you need at least one Advisor in your database.

1. Go to your **Supabase SQL Editor**.
2. Run the following SQL to create a test advisor:
   ```sql
   INSERT INTO advisors (id, first_name, last_name, email)
   VALUES ('99999999-9999-9999-9999-999999999999', 'Test', 'Advisor', 'advisor@test.com');
   ```
3. Go back to your local app (`http://localhost:3000`).
4. Select **Advisor** on the login screen.
5. Enter `99999999-9999-9999-9999-999999999999` as the ID and click Sign In.
6. From the Advisor Dashboard, you can now add Investors and test the full flow!

---

## Troubleshooting

- **"Failed to connect to database"**: Double-check that your `SUPABASE_URL` and `SUPABASE_ANON_KEY` in the `.env` file are exactly correct and have no extra spaces.
- **"AI Generation failed"**: Ensure your `GEMINI_API_KEY` is valid and has not exceeded its quota.
- **Port already in use**: If port 3000 is taken by another app, you can change the port in `server.ts` (look for `const PORT = 3000;`).
