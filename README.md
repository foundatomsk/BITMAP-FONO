# Bitmap Fono

This project is packaged with **Vite + React + TailwindCSS**.
It is ready to be deployed to **Vercel**.

## How to Deploy to Vercel

1.  **Download/Locate this folder**:
    Path: `/Users/leo.thompson/.gemini/antigravity/scratch/bitmap-fono`

2.  **Push to GitHub** (Recommended):
    - Create a new repository on GitHub.
    - Run the following commands in this terminal:
      ```bash
      cd /Users/leo.thompson/.gemini/antigravity/scratch/bitmap-fono
      git init
      git add .
      git commit -m "Initial commit"
      git branch -M main
      git remote add origin <YOUR_GITHUB_REPO_URL>
      git push -u origin main
      ```
    - Go to Vercel.com -> **Add New** -> **Project** -> Import your GitHub Repo.
    - Framework Preset: **Vite** (Should detect automatically).
    - Build Command: `vite build` (Default).
    - Output Directory: `dist` (Default).
    - Click **Deploy**.

3.  **Embed in Squarespace**:
    - Once deployed, Vercel will give you a domain (e.g., `bitmap-fono.vercel.app`).
    - Go to Squarespace -> **Website** -> **Pages**.
    - Add a **Code Block** or **Embed Block**.
    - If using an **iFrame**:
      ```html
      <iframe src="https://YOUR-VERCEL-URL.vercel.app" width="100%" height="800px" frameborder="0" style="border:0; overflow:hidden;"></iframe>
      ```

## Local Development

1.  Open terminal in this folder.
2.  Run `npm install`.
3.  Run `npm run dev`.
