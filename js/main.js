/**
 * HARIBOW YouTube 総再生回数チェッカー
 * YouTube Data API v3を使用してHARIBOW関連動画の総再生回数を集計
 */

class HARIBOWChecker {
    constructor() {
        this.API_KEY = 'AIzaSyBpVv0ets7lBGfsl2spWpoEs2ZsSqP0-do'; // デフォルトAPIキー
        this.SEARCH_QUERY = 'HARIBOW';
        this.MAX_RESULTS = 250;
        this.WORD_PATTERN = /\bharibow\b/i; // 単語として厳密にマッチ
        
        this.chart = null;
        this.searchHistory = [];
        
        this.init();
    }

    /**
     * 初期化処理
     */
    init() {
        this.loadStoredData();
        this.setupEventListeners();
        this.checkApiKey();
    }

    /**
     * ローカルストレージからデータを読み込み
     */
    loadStoredData() {
        // APIキーの読み込み
        const storedApiKey = localStorage.getItem('youtube_api_key');
        if (storedApiKey) {
            this.API_KEY = storedApiKey;
        }

        // 検索履歴の読み込み
        const storedHistory = localStorage.getItem('haribow_search_history');
        if (storedHistory) {
            try {
                this.searchHistory = JSON.parse(storedHistory);
            } catch (e) {
                console.error('履歴データの読み込みエラー:', e);
                this.searchHistory = [];
            }
        }
    }

    /**
     * データをローカルストレージに保存
     */
    saveToStorage() {
        localStorage.setItem('youtube_api_key', this.API_KEY);
        localStorage.setItem('haribow_search_history', JSON.stringify(this.searchHistory));
    }

    /**
     * イベントリスナーの設定
     */
    setupEventListeners() {
        // APIキー関連
        document.getElementById('toggleApiKey').addEventListener('click', this.toggleApiKeyVisibility.bind(this));
        document.getElementById('saveApiKey').addEventListener('click', this.saveApiKey.bind(this));
        document.getElementById('apiKeyInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.saveApiKey();
            }
        });

        // 検索ボタン
        document.getElementById('searchButton').addEventListener('click', this.startSearch.bind(this));

        // その他のボタン
        document.getElementById('retryButton').addEventListener('click', this.startSearch.bind(this));
        document.getElementById('clearHistory').addEventListener('click', this.clearHistory.bind(this));
        document.getElementById('settingsButton').addEventListener('click', this.showApiKeySection.bind(this));
        document.getElementById('cancelApiKey').addEventListener('click', this.showMainContent.bind(this));
    }

    /**
     * APIキーの状態をチェックして適切な画面を表示
     */
    checkApiKey() {
        // デフォルトAPIキーを使用して直接メインコンテンツを表示
        this.showMainContent();
        this.displayHistory();
    }

    /**
     * APIキーの表示/非表示を切り替え
     */
    toggleApiKeyVisibility() {
        const input = document.getElementById('apiKeyInput');
        const button = document.getElementById('toggleApiKey');
        const icon = button.querySelector('i');

        if (input.type === 'password') {
            input.type = 'text';
            icon.className = 'fas fa-eye-slash';
        } else {
            input.type = 'password';
            icon.className = 'fas fa-eye';
        }
    }

    /**
     * APIキーを保存
     */
    saveApiKey() {
        const input = document.getElementById('apiKeyInput');
        const apiKey = input.value.trim();

        if (!apiKey) {
            this.showError('APIキーを入力してください。');
            return;
        }

        if (apiKey.length < 10) {
            this.showError('有効なAPIキーを入力してください。');
            return;
        }

        this.API_KEY = apiKey;
        this.saveToStorage();
        this.showMainContent();
        this.displayHistory();
        
        // 成功メッセージを表示
        this.showSuccess('APIキーが保存されました。');
    }

    /**
     * メインコンテンツを表示
     */
    showMainContent() {
        document.getElementById('apiKeySection').style.display = 'none';
        document.getElementById('mainContent').style.display = 'block';
        
        // APIキー入力フィールドをクリア（セキュリティのため）
        document.getElementById('apiKeyInput').value = '';
    }

    /**
     * APIキーセクションを表示
     */
    showApiKeySection() {
        document.getElementById('apiKeySection').style.display = 'block';
        document.getElementById('mainContent').style.display = 'none';
        
        // デフォルトAPIキーが設定されている場合は表示
        if (this.API_KEY) {
            document.getElementById('apiKeyInput').value = this.API_KEY;
        }
    }

    /**
     * 検索開始
     */
    async startSearch() {
        this.hideAllSections();
        this.showLoading();
        
        try {
            const result = await this.searchHARIBOWVideos();
            this.displayResult(result);
            this.addToHistory(result);
            this.displayHistory();
        } catch (error) {
            console.error('検索エラー:', error);
            this.showError(error.message);
        }
    }

    /**
     * HARIBOW関連動画を検索して総再生回数を計算
     */
    async searchHARIBOWVideos() {
        this.updateProgress('動画を検索しています...');
        
        // 動画IDを取得
        const videoIds = await this.getVideoIdsStrict();
        
        if (videoIds.length === 0) {
            throw new Error('HARIBOW関連の動画が見つかりませんでした。');
        }

        this.updateProgress(`${videoIds.length}本の動画の再生回数を取得しています...`);
        
        // 総再生回数を計算
        const totalViews = await this.getTotalViews(videoIds);
        
        return {
            totalViews: totalViews,
            videoCount: videoIds.length,
            searchDate: new Date().toISOString()
        };
    }

    /**
     * 厳密なフィルタリングで動画IDを取得
     */
    async getVideoIdsStrict() {
        const videoIds = [];
        const processedVideoIds = new Set(); // 重複除去用
        let nextPageToken = null;
        const maxResults = 50; // YouTubeAPIの制限
        let totalSearched = 0;
        let pagesSearched = 0;

        console.log('動画検索を開始...');

        while (videoIds.length < this.MAX_RESULTS && pagesSearched < 20) { // 最大20ページまで
            const url = this.buildSearchUrl(nextPageToken, maxResults);
            
            try {
                const response = await fetch(url);
                
                if (!response.ok) {
                    if (response.status === 403) {
                        throw new Error('APIキーが無効か、API制限に達しました。APIキーを確認してください。');
                    } else if (response.status === 400) {
                        throw new Error('検索パラメータが無効です。');
                    } else {
                        throw new Error(`API呼び出しエラー: ${response.status} ${response.statusText}`);
                    }
                }

                const data = await response.json();
                pagesSearched++;
                
                if (!data.items || data.items.length === 0) {
                    console.log('検索結果がありません。検索を終了します。');
                    break;
                }

                let matchedInThisPage = 0;
                totalSearched += data.items.length;

                // タイトルまたは説明文に"HARIBOW"が単語として含まれる動画をフィルタリング
                for (const item of data.items) {
                    const videoId = item.id.videoId;
                    
                    // 重複チェック
                    if (processedVideoIds.has(videoId)) {
                        continue;
                    }
                    processedVideoIds.add(videoId);

                    const title = item.snippet.title || '';
                    const description = item.snippet.description || '';
                    
                    if (this.WORD_PATTERN.test(title) || this.WORD_PATTERN.test(description)) {
                        videoIds.push(videoId);
                        matchedInThisPage++;
                        
                        // デバッグ情報
                        console.log(`マッチ ${videoIds.length}: ${title}`);
                        
                        if (videoIds.length >= this.MAX_RESULTS) {
                            break;
                        }
                    }
                }

                console.log(`ページ ${pagesSearched}: ${matchedInThisPage}/${data.items.length} がマッチ (累計: ${videoIds.length}/${totalSearched})`);
                this.updateProgress(`${videoIds.length}本の動画を発見... (${pagesSearched}ページ検索済み)`);

                nextPageToken = data.nextPageToken;
                if (!nextPageToken) {
                    console.log('全ページを検索完了');
                    break;
                }

                // レート制限対策
                await this.sleep(200); // 少し長めに待機
                
            } catch (error) {
                console.error(`ページ ${pagesSearched} でエラー:`, error);
                if (error.message.includes('API')) {
                    throw error;
                } else {
                    throw new Error('ネットワークエラーが発生しました。インターネット接続を確認してください。');
                }
            }
        }

        console.log(`検索完了: ${videoIds.length}本の動画が見つかりました`);
        return videoIds;
    }

    /**
     * 動画の総再生回数を取得
     */
    async getTotalViews(videoIds) {
        let totalViews = 0;
        const batchSize = 50; // YouTube APIの制限
        const viewCounts = [];
        let processedCount = 0;

        console.log(`${videoIds.length}本の動画の再生回数を取得開始...`);

        for (let i = 0; i < videoIds.length; i += batchSize) {
            const batch = videoIds.slice(i, i + batchSize);
            const url = this.buildVideosUrl(batch);

            try {
                const response = await fetch(url);
                
                if (!response.ok) {
                    console.warn(`バッチ ${Math.floor(i/batchSize) + 1} でエラー: ${response.status}`);
                    continue;
                }

                const data = await response.json();
                
                if (data.items) {
                    for (const item of data.items) {
                        const viewCount = parseInt(item.statistics.viewCount || '0');
                        totalViews += viewCount;
                        viewCounts.push({
                            videoId: item.id,
                            viewCount: viewCount,
                            title: videoIds.find(id => id === item.id) // タイトル情報があれば
                        });
                        processedCount++;
                    }
                }

                const batchNum = Math.floor(i/batchSize) + 1;
                const totalBatches = Math.ceil(videoIds.length / batchSize);
                console.log(`バッチ ${batchNum}/${totalBatches} 完了: ${data.items?.length || 0}本処理`);
                this.updateProgress(`再生回数を取得中... ${processedCount}/${videoIds.length}本完了`);

                // レート制限対策
                await this.sleep(150);
                
            } catch (error) {
                console.warn(`バッチ ${Math.floor(i/batchSize) + 1} でエラー:`, error);
                // 個別のバッチエラーの場合は続行
            }
        }

        console.log(`再生回数取得完了: ${processedCount}本処理, 総再生回数: ${totalViews.toLocaleString()}`);
        console.log('上位10動画の再生回数:', viewCounts.sort((a, b) => b.viewCount - a.viewCount).slice(0, 10));
        
        return totalViews;
    }

    /**
     * 検索用URLを構築
     */
    buildSearchUrl(pageToken, maxResults) {
        const params = new URLSearchParams({
            key: this.API_KEY,
            q: this.SEARCH_QUERY,
            type: 'video',
            part: 'id,snippet',
            maxResults: maxResults.toString(),
            order: 'relevance',
            safeSearch: 'none',
            videoDefinition: 'any',
            videoDuration: 'any',
            videoEmbeddable: 'any',
            videoSyndicated: 'any'
        });

        if (pageToken) {
            params.append('pageToken', pageToken);
        }

        return `https://www.googleapis.com/youtube/v3/search?${params.toString()}`;
    }

    /**
     * 動画情報取得用URLを構築
     */
    buildVideosUrl(videoIds) {
        const params = new URLSearchParams({
            key: this.API_KEY,
            part: 'statistics',
            id: videoIds.join(',')
        });

        return `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`;
    }

    /**
     * 結果を表示
     */
    displayResult(result) {
        const totalViewElement = document.getElementById('totalViewCount');
        const videoCountElement = document.getElementById('videoCount');
        const searchDateElement = document.getElementById('searchDate');

        // カンマ区切りで数値を表示
        totalViewElement.textContent = result.totalViews.toLocaleString();
        videoCountElement.textContent = result.videoCount.toLocaleString();
        searchDateElement.textContent = new Date(result.searchDate).toLocaleString('ja-JP');

        this.hideAllSections();
        document.getElementById('resultSection').style.display = 'block';
    }

    /**
     * 検索履歴に追加
     */
    addToHistory(result) {
        const historyItem = {
            date: result.searchDate,
            totalViews: result.totalViews,
            videoCount: result.videoCount,
            displayDate: new Date(result.searchDate).toLocaleDateString('ja-JP')
        };

        this.searchHistory.push(historyItem);
        
        // 履歴は最大30件まで保持
        if (this.searchHistory.length > 30) {
            this.searchHistory = this.searchHistory.slice(-30);
        }

        this.saveToStorage();
    }

    /**
     * 検索履歴をグラフで表示
     */
    displayHistory() {
        if (this.searchHistory.length === 0) {
            document.getElementById('chartSection').style.display = 'none';
            return;
        }

        document.getElementById('chartSection').style.display = 'block';

        const ctx = document.getElementById('historyChart').getContext('2d');
        
        // 既存のチャートを破棄
        if (this.chart) {
            this.chart.destroy();
        }

        const labels = this.searchHistory.map(item => item.displayDate);
        const data = this.searchHistory.map(item => item.totalViews);

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'HARIBOW総再生回数',
                    data: data,
                    borderColor: '#ff0000',
                    backgroundColor: 'rgba(255, 0, 0, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#ff0000',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'HARIBOW総再生回数の推移',
                        font: {
                            size: 16,
                            weight: 'bold'
                        }
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        ticks: {
                            callback: function(value) {
                                return value.toLocaleString() + '回';
                            }
                        },
                        title: {
                            display: true,
                            text: '総再生回数'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: '検索日'
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `総再生回数: ${context.parsed.y.toLocaleString()}回`;
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * 履歴をクリア
     */
    clearHistory() {
        if (confirm('検索履歴を全て削除しますか？')) {
            this.searchHistory = [];
            this.saveToStorage();
            
            if (this.chart) {
                this.chart.destroy();
                this.chart = null;
            }
            
            document.getElementById('chartSection').style.display = 'none';
            this.showSuccess('検索履歴をクリアしました。');
        }
    }

    /**
     * 全セクションを非表示
     */
    hideAllSections() {
        document.getElementById('loadingSection').style.display = 'none';
        document.getElementById('resultSection').style.display = 'none';
        document.getElementById('errorSection').style.display = 'none';
        document.getElementById('chartSection').style.display = 'none';
    }

    /**
     * ローディング表示
     */
    showLoading() {
        document.getElementById('loadingSection').style.display = 'block';
    }

    /**
     * プログレス更新
     */
    updateProgress(message) {
        document.getElementById('progressText').textContent = message;
    }

    /**
     * エラー表示
     */
    showError(message) {
        this.hideAllSections();
        document.getElementById('errorMessage').textContent = message;
        document.getElementById('errorSection').style.display = 'block';
    }

    /**
     * 成功メッセージ表示
     */
    showSuccess(message) {
        // 既存の成功メッセージを削除
        const existingMessage = document.querySelector('.success-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // 新しい成功メッセージを作成
        const successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        successDiv.textContent = message;
        
        // メインコンテンツの最初に挿入
        const mainContent = document.getElementById('mainContent');
        mainContent.insertBefore(successDiv, mainContent.firstChild);

        // 3秒後に自動削除
        setTimeout(() => {
            if (successDiv.parentNode) {
                successDiv.remove();
            }
        }, 3000);
    }

    /**
     * スリープ関数
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// アプリケーション開始
document.addEventListener('DOMContentLoaded', () => {
    new HARIBOWChecker();
});