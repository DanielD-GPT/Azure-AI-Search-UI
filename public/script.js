class SearchApp {
    constructor() {
        this.searchForm = document.getElementById('searchForm');
        this.searchInput = document.getElementById('searchInput');
        this.resultsSearchForm = document.getElementById('resultsSearchForm');
        this.resultsSearchInput = document.getElementById('resultsSearchInput');
        this.loadingSpinner = document.getElementById('loadingSpinner');
        this.resultsContainer = document.getElementById('resultsContainer');
        this.resultsList = document.getElementById('resultsList');
        this.resultsTitle = document.getElementById('resultsTitle');
        this.resultsCount = document.getElementById('resultsCount');
        this.errorMessage = document.getElementById('errorMessage');

        // Page elements
        this.homePage = document.getElementById('homePage');
        this.resultsPage = document.getElementById('resultsPage');

        // Pagination properties
        this.allResults = [];
        this.currentPage = 1;
        this.resultsPerPage = 50;
        this.maxResults = 300; // Maximum 300 results (6 pages × 50 results)

        this.init();
    }

    init() {
        this.searchForm.addEventListener('submit', (e) => this.handleSearch(e));
        this.resultsSearchForm.addEventListener('submit', (e) => this.handleSearch(e));
    }

    showHomePage() {
        this.homePage.classList.remove('hidden');
        this.resultsPage.classList.add('hidden');
    }

    showResultsPage() {
        this.homePage.classList.add('hidden');
        this.resultsPage.classList.remove('hidden');
    }

    async handleSearch(e) {
        e.preventDefault();
        
        // Get query from either search form
        const isResultsPageSearch = e.target.id === 'resultsSearchForm';
        const query = isResultsPageSearch ? 
            this.resultsSearchInput.value.trim() : 
            this.searchInput.value.trim();
            
        if (!query) return;

        // Store the current search query for highlighting
        this.currentSearchQuery = query;

        // Sync search inputs
        this.searchInput.value = query;
        this.resultsSearchInput.value = query;

        this.showLoading();
        this.hideError();
        this.hideResults();

        try {
            const response = await fetch('/api/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query, top: 300 })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            // Navigate to results page and display results
            this.showResultsPage();
            this.displayResults(data.results, query);

        } catch (error) {
            console.error('Search error:', error);
            this.showError();
        } finally {
            this.hideLoading();
        }
    }

    displayResults(results, query) {
        if (!results || results.length === 0) {
            this.showNoResults(query);
            return;
        }

        // Store all results and reset to first page
        this.allResults = results;
        this.currentPage = 1;

        this.resultsTitle.textContent = `Search Results for "${query}"`;
        this.resultsCount.textContent = `${results.length} result${results.length !== 1 ? 's' : ''} found`;

        this.displayCurrentPage();
        this.createPagination();
        this.showResults();
    }

    displayCurrentPage() {
        const startIndex = (this.currentPage - 1) * this.resultsPerPage;
        const endIndex = startIndex + this.resultsPerPage;
        const currentResults = this.allResults.slice(startIndex, endIndex);

        this.resultsList.innerHTML = currentResults.map(result => this.createResultHTML(result)).join('');
        
        // Update results count to show current page info
        const totalResults = this.allResults.length;
        const showingFrom = startIndex + 1;
        const showingTo = Math.min(endIndex, totalResults);
        
        this.resultsCount.innerHTML = `
            Showing ${showingFrom}-${showingTo} of ${totalResults} results
            <span class="page-indicator">Page ${this.currentPage} of ${Math.ceil(totalResults / this.resultsPerPage)}</span>
        `;
    }

    createPagination() {
        const totalPages = Math.ceil(this.allResults.length / this.resultsPerPage);
        
        // Remove existing pagination
        const existingPagination = document.querySelector('.pagination');
        if (existingPagination) {
            existingPagination.remove();
        }

        if (totalPages <= 1) return;

        const paginationContainer = document.createElement('div');
        paginationContainer.className = 'pagination';

        // Previous button
        const prevButton = document.createElement('button');
        prevButton.className = `page-btn nav-btn ${this.currentPage === 1 ? 'disabled' : ''}`;
        prevButton.innerHTML = '← Previous';
        prevButton.disabled = this.currentPage === 1;
        prevButton.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.displayCurrentPage();
                this.createPagination();
                this.scrollToResults();
            }
        });
        paginationContainer.appendChild(prevButton);

        // Create page buttons
        for (let page = 1; page <= totalPages; page++) {
            const pageButton = document.createElement('button');
            pageButton.className = `page-btn ${page === this.currentPage ? 'active' : ''}`;
            pageButton.innerHTML = `${page}`;
            pageButton.title = `Page ${page}`;
            
            pageButton.addEventListener('click', () => {
                this.currentPage = page;
                this.displayCurrentPage();
                this.createPagination();
                this.scrollToResults();
            });

            paginationContainer.appendChild(pageButton);
        }

        // Next button
        const nextButton = document.createElement('button');
        nextButton.className = `page-btn nav-btn ${this.currentPage === totalPages ? 'disabled' : ''}`;
        nextButton.innerHTML = 'Next Page →';
        nextButton.disabled = this.currentPage === totalPages;
        nextButton.addEventListener('click', () => {
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.displayCurrentPage();
                this.createPagination();
                this.scrollToResults();
            }
        });
        paginationContainer.appendChild(nextButton);

        this.resultsContainer.appendChild(paginationContainer);
    }

    updatePaginationButtons() {
        const pageButtons = document.querySelectorAll('.page-btn');
        pageButtons.forEach((btn, index) => {
            btn.classList.toggle('active', index + 1 === this.currentPage);
        });
    }

    scrollToResults() {
        this.resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    createResultHTML(result) {
        const title = this.escapeHtml(result.title || 'Untitled');
        const content = this.truncateText(this.escapeHtml(result.content || ''), 300);
        const url = result.url || '#';
        const score = result.score ? result.score.toFixed(2) : 'N/A';
        const rerankerScore = result.rerankerScore ? result.rerankerScore.toFixed(2) : null;
        
        // Extract document name from the path
        const documentName = this.getDocumentName(url);
        
        // Handle semantic captions (more relevant snippets from semantic search)
        const semanticCaption = result.captions && result.captions.length > 0 ? 
            result.captions[0].text : null;

        // Create entity badges
        const entities = [];
        if (result.persons && result.persons.length > 0) {
            entities.push(`<span class="entity-badge persons">👤 ${result.persons.slice(0, 3).join(', ')}</span>`);
        }
        if (result.locations && result.locations.length > 0) {
            entities.push(`<span class="entity-badge locations">📍 ${result.locations.slice(0, 3).join(', ')}</span>`);
        }
        if (result.organizations && result.organizations.length > 0) {
            entities.push(`<span class="entity-badge organizations">🏢 ${result.organizations.slice(0, 2).join(', ')}</span>`);
        }

        // Create key phrases
        const keyPhrases = result.keyPhrases && result.keyPhrases.length > 0 
            ? `<div class="key-phrases"><strong>Key Phrases:</strong> ${result.keyPhrases.slice(0, 5).map(phrase => `<span class="key-phrase">${this.escapeHtml(phrase)}</span>`).join(' ')}</div>`
            : '';

        // Use semantic caption if available (more relevant than regular content)
        const displayContent = semanticCaption ? 
            this.highlightSearchTerms(this.escapeHtml(semanticCaption)) :
            this.highlightSearchTerms(this.highlightText(content, result.highlights));

        return `
            <div class="result-item">
                <div class="result-title">
                    <a href="${url}" target="_blank" class="document-link">📄 ${documentName}</a>
                    ${rerankerScore ? `<span class="semantic-badge">Semantic AI</span>` : ''}
                </div>
                <div class="result-content">
                    ${displayContent}
                    ${semanticCaption ? '<div class="semantic-indicator">🧠 AI-enhanced snippet</div>' : ''}
                </div>
                ${keyPhrases}
                ${entities.length > 0 ? `<div class="entities" style="margin-top: 0.5rem;">${entities.join(' ')}</div>` : ''}
                <div class="result-meta">
                    <span class="result-score">Relevance: ${score}</span>
                    ${rerankerScore ? `<span class="reranker-score">AI Score: ${rerankerScore}</span>` : ''}
                </div>
            </div>
        `;
    }

    highlightText(text, highlights) {
        if (!highlights) return text;

        let highlightedText = text;
        Object.values(highlights).forEach(highlightArray => {
            if (Array.isArray(highlightArray)) {
                highlightArray.forEach(highlight => {
                    const regex = new RegExp(`(${this.escapeRegex(highlight)})`, 'gi');
                    highlightedText = highlightedText.replace(regex, '<span class="highlight">$1</span>');
                });
            }
        });

        return highlightedText;
    }

    highlightSearchTerms(text) {
        if (!this.currentSearchQuery) return text;
        
        // Split search query into individual terms
        const searchTerms = this.currentSearchQuery.toLowerCase().split(/\s+/).filter(term => term.length > 2);
        let highlightedText = text;
        
        searchTerms.forEach(term => {
            const regex = new RegExp(`\\b(${this.escapeRegex(term)})\\b`, 'gi');
            highlightedText = highlightedText.replace(regex, '<strong class="search-term">$1</strong>');
        });
        
        return highlightedText;
    }

    getDocumentName(url) {
        if (!url || url === '#') return 'Unknown Document';
        
        // Extract filename from URL/path
        const parts = url.split('/');
        const filename = parts[parts.length - 1];
        
        // Decode URL encoding if present
        try {
            return decodeURIComponent(filename) || 'Document';
        } catch (e) {
            return filename || 'Document';
        }
    }

    showNoResults(query) {
        this.resultsTitle.textContent = `No results found for "${query}"`;
        this.resultsCount.textContent = '0 results';
        this.resultsList.innerHTML = `
            <div class="result-item">
                <div class="result-content" style="text-align: center; color: #666;">
                    <p>No documents match your search criteria.</p>
                    <p>Try using different keywords or check your spelling.</p>
                </div>
            </div>
        `;
        this.showResults();
    }

    showLoading() {
        this.loadingSpinner.classList.remove('hidden');
    }

    hideLoading() {
        this.loadingSpinner.classList.add('hidden');
    }

    showResults() {
        this.resultsContainer.classList.remove('hidden');
    }

    hideResults() {
        this.resultsContainer.classList.add('hidden');
    }

    showError() {
        this.errorMessage.classList.remove('hidden');
    }

    hideError() {
        this.errorMessage.classList.add('hidden');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substr(0, maxLength) + '...';
    }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SearchApp();
});