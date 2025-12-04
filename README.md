# Azure AI Search Application

A modern Node.js web application that provides an elegant search interface powered by Azure AI Search with semantic search capabilities.

## Features

- 🔍 **Semantic Search** - AI-powered search with query rewriting and semantic ranking
- 📄 **300 Results** - Up to 300 search results with 50 per page pagination
- 🎨 **Modern UI** - Clean, responsive interface with navy theme
- ⚡ **Real-time Search** - Instant results with highlighted matches
- 🧠 **AI Captions** - Semantic snippets highlighting relevant content
- 🏷️ **Entity Extraction** - Displays persons, locations, organizations, and key phrases
- 📱 **Responsive Design** - Works on desktop and mobile devices

## Prerequisites

- Node.js (v14 or higher)
- Azure AI Search service
- Azure AI Search index with documents

## Quick Start

### 1. Clone and install dependencies:
```bash
git clone <your-repo-url>
cd azure-ai-search-app
npm install
```

### 2. Configure Azure AI Search:

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` with your Azure AI Search credentials:
```env
# Required - Get from Azure Portal > Your Search Service
AZURE_SEARCH_ENDPOINT=https://YOUR_SERVICE_NAME.search.windows.net
AZURE_SEARCH_API_KEY=YOUR_API_KEY
AZURE_SEARCH_INDEX_NAME=YOUR_INDEX_NAME

# Optional - Enable semantic search (requires semantic configuration on your index)
AZURE_SEARCH_SEMANTIC_CONFIG=YOUR_SEMANTIC_CONFIG_NAME
```

**Where to find these values:**
| Variable | Location in Azure Portal |
|----------|-------------------------|
| `AZURE_SEARCH_ENDPOINT` | Search Service > Overview > Url |
| `AZURE_SEARCH_API_KEY` | Search Service > Keys > Primary admin key |
| `AZURE_SEARCH_INDEX_NAME` | Search Service > Indexes > Index name |
| `AZURE_SEARCH_SEMANTIC_CONFIG` | Search Service > Indexes > Your Index > Semantic configurations |

### 3. Configure Network Access (if needed):

If your Azure AI Search has firewall rules:
1. Go to Azure Portal > Your Search Service > **Networking**
2. Add your IP address to the firewall allowlist
3. Or set "Public network access" to "All networks" for development

### 4. Start the application:
```bash
# Development mode with auto-restart
npm run dev

# Production mode
npm start
```

### 5. Open your browser:
Navigate to `http://localhost:3000`

## Project Structure

```
├── public/
│   ├── index.html      # Main HTML page
│   ├── styles.css      # Modern CSS styling
│   └── script.js       # Frontend JavaScript with pagination
├── routes/
│   └── search.js       # Search API routes with semantic search
├── server.js           # Express server setup
├── package.json        # Dependencies and scripts
├── .env.example        # Environment configuration template
└── web.config          # Azure App Service deployment config
```

## API Endpoints

### Search
- **POST** `/api/search`
  - Body: `{ "query": "search terms", "top": 300 }`
  - Returns: `{ "results": [...], "count": number, "totalResults": number }`

### Index Info
- **GET** `/api/search/info`
  - Returns: `{ "indexName": "...", "documentCount": number }`

## Deployment

### Azure App Service
This app includes `web.config` for easy deployment to Azure App Service:

1. Create an Azure App Service (Node.js)
2. Set environment variables in App Service Configuration
3. Deploy via GitHub Actions, VS Code, or Azure CLI

### Environment Variables for Production
Set these in your hosting platform:
- `AZURE_SEARCH_ENDPOINT`
- `AZURE_SEARCH_API_KEY`
- `AZURE_SEARCH_INDEX_NAME`
- `AZURE_SEARCH_SEMANTIC_CONFIG` (optional)
- `PORT` (usually set automatically)

## Customization

- **Styling**: Modify `public/styles.css` to change colors and layout
- **Search Fields**: Update `select` array in `routes/search.js` for your index fields
- **Results Per Page**: Change `resultsPerPage` in `public/script.js` (default: 50)
- **Max Results**: Change `maxResults` in `public/script.js` (default: 300)

## Troubleshooting

| Error | Solution |
|-------|----------|
| 403 Forbidden | Add your IP to Azure Search firewall rules |
| 401 Unauthorized | Check your API key in `.env` |
| 404 Not Found | Verify your index name exists |
| Connection timeout | Check network connectivity to Azure |

## License

MIT