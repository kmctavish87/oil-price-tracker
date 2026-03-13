# Oil Price Tracker

Oil price tracker with:

- Latest WTI spot price
- Latest Brent spot price
- Day-over-day change
- 30-day comparison chart

The frontend can stay on GitHub Pages. The backend is a small Node/Express API that keeps the EIA key on the server.

## Files

- `index.html` - app markup
- `styles.css` - layout and styling
- `app.js` - frontend logic and backend API consumption
- `server.js` - Express backend that proxies EIA
- `.env.example` - backend environment variables
- `package.json` - backend dependencies and scripts

## Backend setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

3. Set `EIA_API_KEY` in `.env`.
4. Leave `CORS_ORIGIN=*` for local testing, or set it to your frontend origin.
5. Start the backend:

   ```bash
   npm run dev
   ```

6. Test it:

   ```bash
   curl http://localhost:3000/api/health
   curl http://localhost:3000/api/oil
   ```

## Frontend local use

Serve the frontend directory and enter `http://localhost:3000` as the backend URL:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## GitHub Pages deployment

1. Create a new GitHub repository and push this folder to the `main` branch.
2. Keep `.github/workflows/deploy-pages.yml` in the repo so GitHub Actions can publish the site.
3. In GitHub, open `Settings` -> `Pages`.
4. Under `Build and deployment`, set `Source` to `GitHub Actions`.
5. Push to `main` or run the `Deploy static site to Pages` workflow manually.
6. Deploy the backend separately on a Node host.
7. Open the published Pages URL and enter your backend base URL in the app.

The `.nojekyll` file is included so GitHub Pages serves the site as plain static content.

## Backend deployment

GitHub Pages cannot run a backend server. You need to deploy `server.js` to a service that supports Node processes.

Typical flow:

- Set `EIA_API_KEY`
- Set `CORS_ORIGIN` to your GitHub Pages origin
- Run `npm start`

This repo also includes `render.yaml` if you want to deploy the backend on Render from the same GitHub repository.

## Data source

- WTI: `PET.RWTC.D`
- Brent: `PET.RBRTE.D`

Source documentation:

- [EIA Open Data API](https://www.eia.gov/opendata/)
