# Azure AI Search UI

A Node.js web application that provides a modern search interface powered by Azure AI Search, with semantic ranking, document previews, and secure access to private blob storage through Azure Private Endpoints.

![Node.js](https://img.shields.io/badge/Node.js-20_LTS-green) ![Azure](https://img.shields.io/badge/Azure-App_Service-blue) ![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

- **Semantic Search** — AI-powered search with query rewriting and semantic ranking
- **Managed Identity Auth** — No API keys; uses `DefaultAzureCredential` for zero-secret deployment
- **Private Blob Proxy** — Streams documents from private Azure Blob Storage through the App Service (no public storage exposure)
- **Sort Controls** — Sort results by relevance score or AI reranker score
- **Pagination** — Up to 300 results with 50 per page
- **Search Highlighting** — Highlights matching terms and AI-generated captions
- **Base64 Decoding** — Automatically decodes base64-encoded `parent_id` fields to human-readable document names
- **Responsive UI** — Clean navy-themed interface that works on desktop and mobile
- **Gzip Compression** — Server-side compression for faster load times

## Architecture

```
┌─────────────┐     HTTPS      ┌──────────────────────┐
│   Browser   │◄──────────────►│  Azure App Service   │
│             │                │  (Node.js + Express)  │
└─────────────┘                │  System Managed ID    │
                               └──────┬───────┬───────┘
                                      │       │
                          VNet Integration    │
                                      │       │
                    ┌─────────────────▼──┐    │  RBAC: Search Index
                    │  VNet (westus2)    │    │  Data Reader
                    │  10.41.0.0/16     │    │
                    └────────┬──────────┘    │
                             │               │
                         VNet Peering        │
                             │               │
                    ┌────────▼──────────┐    │
                    │  VNet (eastus2)    │    │
                    │  10.40.0.0/16     │    │
                    │                   │    │
                    │  ┌─────────────┐  │    │
                    │  │ Private     │  │    │
                    │  │ Endpoints   │  │    │
                    │  └──┬──────┬───┘  │    │
                    └─────┼──────┼──────┘    │
                          │      │           │
              ┌───────────▼┐  ┌──▼───────────▼──┐
              │ Azure Blob  │  │ Azure AI Search │
              │ Storage     │  │ Service         │
              │ (Private)   │  │ (aadOrApiKey)   │
              └─────────────┘  └─────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Managed Identity** over API keys | Eliminates secret rotation; RBAC-scoped access |
| **Blob Proxy** over SAS URLs | Storage has public access disabled; SAS URLs are unusable from browsers |
| **Cross-region VNet Peering** | App Service and storage/search can be in different regions |
| **Private DNS Zones** | Enables private endpoint name resolution across peered VNets |
| **Compression middleware** | Reduces JSON payload size for 300-result responses |

## Prerequisites

- **Node.js** v18+ (v20 LTS recommended)
- **Azure Subscription** with the following resources:
  - Azure AI Search service (with semantic search enabled on your index)
  - Azure Blob Storage account (containing indexed documents)
  - Azure App Service (Linux, Node.js 20 LTS)

## Quick Start (Local Development)

### 1. Clone and install

```bash
git clone https://github.com/DanielD-GPT/Azure-AI-Search-UI.git
cd Azure-AI-Search-UI
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your Azure AI Search values:

```env
AZURE_SEARCH_ENDPOINT=https://your-search-service.search.windows.net
AZURE_SEARCH_INDEX_NAME=your-index-name
AZURE_SEARCH_SEMANTIC_CONFIG=your-semantic-config-name
```

> **Note:** For local development, you must be logged in via `az login` so `DefaultAzureCredential` can authenticate. Your user account needs the **Search Index Data Reader** role on the search service.

### 3. Run

```bash
npm start        # Production
npm run dev      # Development (auto-restart with nodemon)
```

Open http://localhost:3000

## Azure Deployment

### Step 1: Create the App Service

```bash
az webapp up \
  --name <your-app-name> \
  --resource-group <your-rg> \
  --runtime "NODE:20-lts" \
  --sku B1
```

### Step 2: Enable Managed Identity

```bash
az webapp identity assign \
  --name <your-app-name> \
  --resource-group <your-rg>
```

Save the returned `principalId` — you'll need it for RBAC assignments.

### Step 3: Assign RBAC Roles

**On the Search Service** — so the app can query the index:

```bash
az role assignment create \
  --assignee <principalId> \
  --role "Search Index Data Reader" \
  --scope /subscriptions/<sub-id>/resourceGroups/<rg>/providers/Microsoft.Search/searchServices/<search-service>
```

**On the Storage Account** — so the app can proxy blob downloads:

```bash
az role assignment create \
  --assignee <principalId> \
  --role "Storage Blob Data Reader" \
  --scope /subscriptions/<sub-id>/resourceGroups/<rg>/providers/Microsoft.Storage/storageAccounts/<storage-account>
```

### Step 4: Configure App Settings

```bash
az webapp config appsettings set \
  --name <your-app-name> \
  --resource-group <your-rg> \
  --settings \
    AZURE_SEARCH_ENDPOINT="https://<search-service>.search.windows.net" \
    AZURE_SEARCH_INDEX_NAME="<index-name>" \
    AZURE_SEARCH_SEMANTIC_CONFIG="<semantic-config-name>"
```

### Step 5: Enable AAD Authentication on Search Service

If your search service uses API key-only auth, enable AAD:

```bash
az rest --method PATCH \
  --url "https://management.azure.com/subscriptions/<sub-id>/resourceGroups/<rg>/providers/Microsoft.Search/searchServices/<search-service>?api-version=2024-06-01-preview" \
  --body '{"properties":{"authOptions":{"aadOrApiKey":{"aadAuthFailureMode":"http401WithBearerChallenge"}}}}'
```

## Private Network Setup

If your storage account or search service has **public network access disabled**, you need private endpoint connectivity. This section describes the full network architecture.

### Network Topology

The setup requires:
1. A **VNet in the same region** as your App Service (for VNet integration)
2. A **VNet in the same region** as your storage/search (for private endpoints)
3. **VNet Peering** between them (if cross-region)
4. **Private DNS Zones** linked to both VNets

### Step 1: Create VNets

**App Service VNet** (same region as your App Service):

```bash
az network vnet create \
  --name vnet-appservice \
  --resource-group <your-rg> \
  --location <app-service-region> \
  --address-prefixes 10.41.0.0/16 \
  --subnet-name snet-app-integration \
  --subnet-prefixes 10.41.1.0/24
```

**Data VNet** (same region as your storage/search — skip if it already exists):

```bash
az network vnet create \
  --name vnet-data \
  --resource-group <your-rg> \
  --location <data-region> \
  --address-prefixes 10.40.0.0/16 \
  --subnet-name snet-pe \
  --subnet-prefixes 10.40.2.0/24
```

> **Important:** Address spaces must not overlap.

### Step 2: Delegate Subnet for App Service

```bash
az network vnet subnet update \
  --vnet-name vnet-appservice \
  --resource-group <your-rg> \
  --name snet-app-integration \
  --delegations Microsoft.Web/serverFarms
```

### Step 3: Create Private Endpoints

**For Blob Storage:**

```bash
az network private-endpoint create \
  --name pe-storage-blob \
  --resource-group <your-rg> \
  --subnet <snet-pe-resource-id> \
  --private-connection-resource-id <storage-account-resource-id> \
  --group-id blob \
  --connection-name pe-storage-blob-conn \
  --location <data-region>
```

**For Azure AI Search** (if search is also private):

```bash
az network private-endpoint create \
  --name pe-search \
  --resource-group <your-rg> \
  --subnet <snet-pe-resource-id> \
  --private-connection-resource-id <search-service-resource-id> \
  --group-id searchService \
  --connection-name pe-search-conn \
  --location <data-region>
```

### Step 4: Configure Private DNS Zones

Create DNS zones and link them to **both** VNets:

```bash
# Create zones (skip if they already exist)
az network private-dns zone create --resource-group <your-rg> --name privatelink.blob.core.windows.net
az network private-dns zone create --resource-group <your-rg> --name privatelink.search.windows.net

# Link to data VNet
az network private-dns link vnet create \
  --zone-name privatelink.blob.core.windows.net \
  --resource-group <your-rg> \
  --name link-blob-data \
  --virtual-network vnet-data \
  --registration-enabled false

# Link to App Service VNet
az network private-dns link vnet create \
  --zone-name privatelink.blob.core.windows.net \
  --resource-group <your-rg> \
  --name link-blob-appservice \
  --virtual-network vnet-appservice \
  --registration-enabled false
```

Repeat for `privatelink.search.windows.net` if you have a search private endpoint.

### Step 5: Add DNS A Records

Get the private IP from each private endpoint and create A records:

```bash
# Get the private IP
az network private-endpoint show \
  --name pe-storage-blob \
  --resource-group <your-rg> \
  --query "customDnsConfigs[0].ipAddresses[0]" -o tsv

# Create the A record
az network private-dns record-set a create \
  --zone-name privatelink.blob.core.windows.net \
  --resource-group <your-rg> \
  --name <storage-account-name>

az network private-dns record-set a add-record \
  --zone-name privatelink.blob.core.windows.net \
  --resource-group <your-rg> \
  --record-set-name <storage-account-name> \
  --ipv4-address <private-ip>
```

### Step 6: Set Up VNet Peering (Cross-Region)

If your App Service and data resources are in different regions:

```bash
# App Service VNet → Data VNet
az network vnet peering create \
  --name peer-app-to-data \
  --resource-group <your-rg> \
  --vnet-name vnet-appservice \
  --remote-vnet vnet-data \
  --allow-vnet-access \
  --allow-forwarded-traffic

# Data VNet → App Service VNet
az network vnet peering create \
  --name peer-data-to-app \
  --resource-group <your-rg> \
  --vnet-name vnet-data \
  --remote-vnet vnet-appservice \
  --allow-vnet-access \
  --allow-forwarded-traffic
```

### Step 7: Integrate App Service with VNet

```bash
az webapp vnet-integration add \
  --name <your-app-name> \
  --resource-group <your-rg> \
  --vnet vnet-appservice \
  --subnet snet-app-integration
```

### Step 8: Configure VNet Routing and DNS

```bash
az webapp config appsettings set \
  --name <your-app-name> \
  --resource-group <your-rg> \
  --settings \
    WEBSITE_VNET_ROUTE_ALL=1 \
    WEBSITE_DNS_SERVER=168.63.129.16
```

Restart the App Service to apply:

```bash
az webapp restart --name <your-app-name> --resource-group <your-rg>
```

## Project Structure

```
├── public/
│   ├── index.html          # Single-page app with home + results views
│   ├── styles.css          # Navy-themed responsive CSS
│   └── script.js           # SearchApp class with sort, pagination, base64 decoding
├── routes/
│   └── search.js           # Express router: search, info, and blob proxy endpoints
├── server.js               # Express server with compression and static caching
├── package.json            # Dependencies
├── .env.example            # Environment variable template
├── .gitignore              # Ignores .env, .azure/, node_modules/
└── web.config              # Azure App Service IIS configuration
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/search` | Search the index. Body: `{ "query": "...", "top": 300 }` |
| `GET` | `/api/search/info` | Returns index name and document count |
| `GET` | `/api/search/blob?parentId=<base64>` | Proxies blob download from private storage |

## Customization

| What | Where | Default |
|------|-------|---------|
| Results per page | `public/script.js` → `resultsPerPage` | 50 |
| Max results | `public/script.js` → `maxResults` | 300 |
| Search fields | `routes/search.js` → `select` array | `chunk_id`, `title`, `chunk`, `parent_id` |
| Semantic fields | `routes/search.js` → `semanticFields` | `title`, `chunk` |
| Theme colors | `public/styles.css` | Navy (#1a365d) |

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| 403 Forbidden (search) | Search service auth mode is `apiKeyOnly` | Enable `aadOrApiKey` auth (see Step 5 above) |
| 403 Forbidden (blob) | Missing RBAC role on storage | Assign `Storage Blob Data Reader` to the managed identity |
| ENOTFOUND (blob) | DNS can't resolve storage private endpoint | Verify private DNS zone is linked to the App Service VNet |
| Index not found | Wrong index name in app settings | Check `AZURE_SEARCH_INDEX_NAME` and restart the app |
| Connection timeout | VNet peering not connected | Verify both peering directions show `Connected` state |

## License

MIT

> **Disclaimer:** This application is a prototype for demonstration purposes. It is not designed or tested for production use. Implement appropriate security, scalability, and compliance measures for production scenarios.
