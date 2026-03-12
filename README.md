# Oil Price Tracker

Static oil price tracker designed for GitHub Pages. It shows:

- Latest WTI spot price
- Latest Brent spot price
- Day-over-day change
- 30-day comparison chart

The app uses the U.S. Energy Information Administration API directly from the browser, so there is no backend to deploy.

## Files

- `index.html` - app markup
- `styles.css` - layout and styling
- `app.js` - EIA fetch logic, chart rendering, and refresh handling

## Local use

Open `index.html` in a browser, or serve the folder with any static file server.

## GitHub Pages deployment

1. Create a new GitHub repository and push this folder to the `main` branch.
2. Keep `.github/workflows/deploy-pages.yml` in the repo so GitHub Actions can publish the site.
3. In GitHub, open `Settings` -> `Pages`.
4. Under `Build and deployment`, set `Source` to `GitHub Actions`.
5. Push to `main` or run the `Deploy static site to Pages` workflow manually.
6. Open the published Pages URL and enter your EIA API key in the app.

The `.nojekyll` file is included so GitHub Pages serves the site as plain static content.

## API key

Request a free key from the EIA open data portal:

[https://www.eia.gov/opendata/register.php](https://www.eia.gov/opendata/register.php)

The key is stored only in the browser's local storage on the device where you enter it.

## Data source

- WTI: `PET.RWTC.D`
- Brent: `PET.RBRTE.D`

Source documentation:

- [EIA Open Data API](https://www.eia.gov/opendata/)
