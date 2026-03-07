export function mount(el) {
    // Load CSS if not already loaded
    if (!document.getElementById('trends-css')) {
        const link = document.createElement('link');
        link.id = 'trends-css';
        link.rel = 'stylesheet';
        link.href = './Widgets/Trends/trends.css';
        document.head.appendChild(link);
    }

    el.className = 'widget trends-widget';
    el.innerHTML = `
        <div class="header">
            <span class="title">Performance</span>
            <div class="controls">
                <button class="icon-btn" title="Refresh" id="trendsRefresh">↻</button>
                <button class="icon-btn" title="Minimize">−</button>
                <button class="icon-btn" title="Close">×</button>
            </div>
        </div>
        <div class="content">
            <div class="trends-grid" id="trendsGrid">
                <div class="metric-card loading">Loading...</div>
            </div>
        </div>
    `;

    const grid = el.querySelector('#trendsGrid');
    const refreshBtn = el.querySelector('#trendsRefresh');
    const minimizeBtn = el.querySelector('[title="Minimize"]');
    const closeBtn = el.querySelector('[title="Close"]');

    refreshBtn.onclick = () => loadTrends();

    // Minimize handler
    if (minimizeBtn) {
        minimizeBtn.onclick = () => {
            el.classList.toggle('minimized');
        };
    }

    // Close handler
    if (closeBtn) {
        closeBtn.onclick = () => {
            el.style.display = 'none';
        };
    }

    async function loadTrends() {
        try {
            const apiBase = window.location.origin === 'null' || window.location.origin.startsWith('file:')
                ? 'http://127.0.0.1:7357'
                : window.location.origin;

            const res = await fetch(`${apiBase}/api/trends/metrics`);
            const data = await res.json();

            if (!data.ok) throw new Error(data.error || 'Failed to load trends');

            renderMetrics(data.metrics);
        } catch (e) {
            grid.innerHTML = `<div class="metric-card error">Error: ${e.message}</div>`;
        }
    }

    function renderMetrics(metrics) {
        if (!metrics || Object.keys(metrics).length === 0) {
            grid.innerHTML = `<div class="metric-card empty">No data available</div>`;
            return;
        }

        const cards = [];

        // Habits
        const habitStats = metrics.habit_stats || {};
        if (habitStats.total_habits > 0) {
            cards.push({
                icon: '🎯',
                title: 'Habits',
                value: habitStats.habits_with_current_streak || 0,
                label: 'Active Streaks',
                subtitle: `Longest: ${habitStats.longest_streak_overall || 0} days`
            });

            cards.push({
                icon: '✓',
                title: 'Today',
                value: `${Math.round(habitStats.completion_rate_today || 0)}%`,
                label: 'Habits Done',
                subtitle: `${habitStats.total_habits} total`
            });
        }

        // Goals
        const goalStats = metrics.goal_stats || {};
        if (goalStats.total_goals > 0) {
            const avgProgress = goalStats.total_goals > 0
                ? Math.round(goalStats.total_progress / goalStats.total_goals)
                : 0;

            cards.push({
                icon: '🎖️',
                title: 'Goals',
                value: `${avgProgress}%`,
                label: 'Avg Progress',
                subtitle: `${goalStats.milestones_completed_this_week || 0} milestones this week`
            });
        }

        // Focus Time
        const timerStats = metrics.timer_stats || {};
        if (timerStats.sessions_total > 0) {
            const hours = Math.floor(timerStats.focus_minutes / 60);
            const mins = timerStats.focus_minutes % 60;
            const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

            cards.push({
                icon: '⏱️',
                title: 'Focus',
                value: timeStr,
                label: 'This Week',
                subtitle: `${timerStats.sessions_total} sessions`
            });
        }

        // Quality
        const qualityCounts = metrics.quality_counts || {};
        if (Object.keys(qualityCounts).length > 0) {
            const totalCount = Object.values(qualityCounts).reduce((a, b) => a + b, 0);
            const weightedSum = Object.entries(qualityCounts).reduce((sum, [rating, count]) => {
                const r = parseFloat(rating);
                return sum + (isNaN(r) ? 0 : r * count);
            }, 0);
            const avgQuality = totalCount > 0 ? (weightedSum / totalCount).toFixed(1) : '0.0';

            cards.push({
                icon: '⭐',
                title: 'Quality',
                value: avgQuality,
                label: 'Average',
                subtitle: `${totalCount} completions`
            });
        }

        // Adherence
        const adherenceStats = metrics.adherence_stats || {};
        const adherencePct = Math.round(adherenceStats.adherence_percentage || 0);
        if (adherencePct > 0 || adherenceStats.on_time_count > 0) {
            cards.push({
                icon: '📊',
                title: 'Adherence',
                value: `${adherencePct}%`,
                label: 'On-Time',
                subtitle: `${adherenceStats.on_time_count || 0} / ${(adherenceStats.on_time_count || 0) + (adherenceStats.late_count || 0)} tasks`
            });
        }

        // Completion Rate
        const blocksTotal = metrics.blocks_total || 0;
        const blocksCompleted = metrics.blocks_completed || 0;
        if (blocksTotal > 0) {
            const completionPct = Math.round((blocksCompleted / blocksTotal) * 100);

            cards.push({
                icon: '📈',
                title: 'Completion',
                value: `${completionPct}%`,
                label: 'Rate',
                subtitle: `${blocksCompleted} / ${blocksTotal} blocks`
            });
        }

        // Render cards
        grid.innerHTML = cards.map(card => `
            <div class="metric-card">
                <div class="metric-icon">${card.icon}</div>
                <div class="metric-content">
                    <div class="metric-title">${card.title}</div>
                    <div class="metric-value">${card.value}</div>
                    <div class="metric-label">${card.label}</div>
                    <div class="metric-subtitle">${card.subtitle || ''}</div>
                </div>
            </div>
        `).join('');
    }

    loadTrends();
}

export function unmount(el) {
    el.innerHTML = '';
}
