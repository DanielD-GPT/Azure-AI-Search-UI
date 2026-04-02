const express = require('express');
const { SearchClient } = require('@azure/search-documents');
const { DefaultAzureCredential } = require('@azure/identity');
const { BlobServiceClient } = require('@azure/storage-blob');
const router = express.Router();

const credential = new DefaultAzureCredential();

// Cache BlobServiceClient per storage account
const blobServiceClients = new Map();

function getBlobServiceClient(accountName) {
    if (!blobServiceClients.has(accountName)) {
        blobServiceClients.set(accountName, new BlobServiceClient(
            `https://${accountName}.blob.core.windows.net`,
            credential
        ));
    }
    return blobServiceClients.get(accountName);
}

// Initialize Azure Search Client with managed identity
let searchClient;
try {
    if (!process.env.AZURE_SEARCH_ENDPOINT || !process.env.AZURE_SEARCH_INDEX_NAME) {
        console.warn('Azure AI Search configuration is incomplete. Please check your .env file.');
        console.warn('Required variables: AZURE_SEARCH_ENDPOINT, AZURE_SEARCH_INDEX_NAME');
    } else {
        searchClient = new SearchClient(
            process.env.AZURE_SEARCH_ENDPOINT,
            process.env.AZURE_SEARCH_INDEX_NAME,
            credential
        );
        console.log('Azure AI Search client initialized with managed identity');
    }
} catch (error) {
    console.error('Failed to initialize Azure AI Search client:', error.message);
}

// Index info endpoint to see available fields
router.get('/info', async (req, res) => {
    try {
        if (!searchClient) {
            return res.status(500).json({
                error: 'Azure AI Search is not configured.',
            });
        }

        // Get index statistics which can help understand the index
        const stats = await searchClient.getDocumentsCount();

        res.json({
            indexName: process.env.AZURE_SEARCH_INDEX_NAME,
            documentCount: stats,
            note: 'Try searching to see what fields are available in your documents'
        });

    } catch (error) {
        console.error('Index info error:', error);
        res.status(500).json({
            error: 'Failed to get index information',
            details: error.message
        });
    }
});

// Search endpoint
router.post('/', async (req, res) => {
    try {
        const { query, top = 100 } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        if (!searchClient) {
            return res.status(500).json({
                error: 'Azure AI Search is not configured. Please check your environment variables.',
                configuration: {
                    endpoint: process.env.AZURE_SEARCH_ENDPOINT || 'Not set',
                    indexName: process.env.AZURE_SEARCH_INDEX_NAME || 'Not set'
                }
            });
        }

        // Search with semantic ranker and query rewriting enabled
        const searchOptions = {
            top: Math.min(parseInt(top) || 300, 300), // Cap at 300 results
            highlightFields: 'chunk,title',
            select: ['chunk_id', 'title', 'chunk', 'parent_id']
        };

        // Add semantic search if configuration is provided
        if (process.env.AZURE_SEARCH_SEMANTIC_CONFIG) {
            searchOptions.queryType = 'semantic';
            searchOptions.semanticConfiguration = process.env.AZURE_SEARCH_SEMANTIC_CONFIG;
            searchOptions.queryRewrite = true;
            searchOptions.semanticFields = {
                titleField: 'title',
                contentFields: ['chunk']
            };
        }

        const searchResults = await searchClient.search(query, searchOptions);

        const results = [];
        for await (const result of searchResults.results) {
            const doc = result.document;

            const item = {
                id: doc.chunk_id,
                title: doc.title || 'Untitled',
                content: doc.chunk || '',
                url: doc.parent_id || '#',
                score: result.score,
            };
            if (result.rerankerScore) item.rerankerScore = result.rerankerScore;
            if (result.highlights) item.highlights = result.highlights;
            if (result.captions) item.captions = result.captions;
            results.push(item);
        }

        res.json({
            results,
            count: results.length,
            totalResults: results.length
        });

    } catch (error) {
        console.error('Search error:', error);
        
        // Check for specific error types
        let errorMessage = 'Search failed. Please check your Azure AI Search configuration.';
        if (error.message.includes('403') || error.message.includes('Forbidden')) {
            errorMessage = 'Access forbidden. Your IP address may not be allowed. Check Azure AI Search network rules.';
        } else if (error.message.includes('404') || error.message.includes('Not Found')) {
            errorMessage = 'Index not found. Please verify your AZURE_SEARCH_INDEX_NAME.';
        } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
            errorMessage = 'Unauthorized. Please check your AZURE_SEARCH_API_KEY.';
        } else if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
            errorMessage = 'Connection timeout. Check network connectivity to Azure AI Search.';
        }

        res.status(500).json({
            error: errorMessage,
            details: error.message
        });
    }
});

// Proxy blob download through App Service (storage is behind private endpoint)
router.get('/blob', async (req, res) => {
    try {
        const { parentId } = req.query;
        if (!parentId) {
            return res.status(400).json({ error: 'parentId is required' });
        }

        // Decode base64 parent_id to get the blob URL
        const blobUrl = Buffer.from(parentId, 'base64').toString('utf-8');

        // Parse the blob URL to extract account, container, and blob name
        const url = new URL(blobUrl);
        const accountName = url.hostname.split('.')[0];
        const pathParts = url.pathname.split('/').filter(Boolean);
        const containerName = pathParts[0];
        const blobName = decodeURIComponent(pathParts.slice(1).join('/'));

        // Remove trailing chunk digit from blob name (e.g. "file.pdf5" -> "file.pdf")
        const cleanBlobName = blobName.replace(/(\.[a-zA-Z]+)\d+$/, '$1');

        const blobServiceClient = getBlobServiceClient(accountName);
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const blobClient = containerClient.getBlobClient(cleanBlobName);

        const downloadResponse = await blobClient.download();

        // Set response headers for inline viewing or download
        const contentType = downloadResponse.contentType || 'application/octet-stream';
        const fileName = cleanBlobName.split('/').pop();
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
        if (downloadResponse.contentLength) {
            res.setHeader('Content-Length', downloadResponse.contentLength);
        }

        // Stream the blob to the client
        downloadResponse.readableStreamBody.pipe(res);
    } catch (error) {
        console.error('Blob proxy error:', error);
        res.status(500).json({ error: 'Failed to retrieve document', details: error.message });
    }
});

module.exports = router;
