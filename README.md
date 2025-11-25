# xCoS Dashboard

## setup guide

```bash
# install dependencies
npm install

# start dev server
npm run dev  # http://localhost:5173

# build for production
npm run build

# check production build
npm run preview
```

## data Loading

### Datasets
Located in: `public/data/thesis-defences/`

Available datasets:
- **CS/TI (June 2021)**: Computer Science master thesis defences

- **MDH (Sept 2025)**: Digital Humanities defences

### Loading Custom Data
1. put CSV files in `public/data/thesis-defences/`
2. check `src/services/programmeDataLoader.ts` with new dataset mappings
3. CSV format: See existing files for schema

