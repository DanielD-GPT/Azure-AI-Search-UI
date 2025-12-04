const express = require('express');
const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
const router = express.Router();

// Initialize Azure Search Client with error handling
let searchClient;
try {
    if (!process.env.AZURE_SEARCH_ENDPOINT || !process.env.AZURE_SEARCH_API_KEY || !process.env.AZURE_SEARCH_INDEX_NAME) {
        console.warn('Azure AI Search configuration is incomplete. Please check your .env file.');
        console.warn('Required variables: AZURE_SEARCH_ENDPOINT, AZURE_SEARCH_API_KEY, AZURE_SEARCH_INDEX_NAME');
    } else {
        searchClient = new SearchClient(
            process.env.AZURE_SEARCH_ENDPOINT,
            process.env.AZURE_SEARCH_INDEX_NAME,
            new AzureKeyCredential(process.env.AZURE_SEARCH_API_KEY)
        );
        console.log('Azure AI Search client initialized successfully');
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
                    hasApiKey: !!process.env.AZURE_SEARCH_API_KEY,
                    indexName: process.env.AZURE_SEARCH_INDEX_NAME || 'Not set'
                }
            });
        }

        // Search with semantic ranker and query rewriting enabled
        const searchOptions = {
            top: Math.min(parseInt(top) || 300, 300), // Cap at 300 results
            highlightFields: 'chunk,title,text',
            select: ['chunk_id', 'title', 'chunk', 'text', 'layoutText', 'metadata_storage_path', 'keyPhrases', 'persons', 'locations', 'organizations']
        };

        // Add semantic search if configuration is provided
        if (process.env.AZURE_SEARCH_SEMANTIC_CONFIG) {
            searchOptions.queryType = 'semantic';
            searchOptions.semanticConfiguration = process.env.AZURE_SEARCH_SEMANTIC_CONFIG;
            searchOptions.queryRewrite = true;
            searchOptions.semanticFields = {
                titleField: 'title',
                contentFields: ['chunk'],
                keywordFields: ['keyPhrases']
            };
        }

        const searchResults = await searchClient.search(query, searchOptions);

        const results = [];
        for await (const result of searchResults.results) {
            const doc = result.document;
            
            results.push({
                id: doc.chunk_id,
                title: doc.title || 'Untitled',
                content: doc.chunk || (Array.isArray(doc.text) ? doc.text.join(' ') : doc.text) || '',
                text: Array.isArray(doc.text) ? doc.text : [doc.text],
                layoutText: Array.isArray(doc.layoutText) ? doc.layoutText : [doc.layoutText],
                url: doc.metadata_storage_path || '#',
                keyPhrases: doc.keyPhrases || [],
                persons: doc.persons || [],
                locations: doc.locations || [],
                organizations: doc.organizations || [],
                score: result.score,
                rerankerScore: result.rerankerScore || null,
                highlights: result.highlights,
                captions: result.captions || null,
                semanticAnswer: result.semanticAnswer || null
            });
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

module.exports = router;