const app = getApp();

Page({
  data: {
    stats: { total: 0, categories: {} },
    allWaypoints: [],       // 全部数据，用于统计
    waypoints: [],           // 当前筛选后的列表
    activeCategory: '',
    loading: true,
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    this.loadAll();
  },

  // 一次查询，同时得出统计和列表（保证数字一致）
  loadAll() {
    this.setData({ loading: true });
    const db = app.getDb();
    if (!db) { this.setData({ loading: false }); return; }

    db.collection('waypoints').orderBy('create_time', 'desc').limit(1000).get().then((res) => {
      const all = res.data || [];

      // 统计
      const catCount = {};
      all.forEach(wp => { catCount[wp.category] = (catCount[wp.category] || 0) + 1; });

      // 筛选
      const cat = this.data.activeCategory;
      const filtered = cat ? all.filter(w => w.category === cat) : all;

      this.setData({
        allWaypoints: all,
        waypoints: filtered,
        stats: { total: all.length, categories: catCount },
        loading: false,
      });
    }).catch(() => {
      this.setData({ allWaypoints: [], waypoints: [], loading: false });
    });
  },

  onCategoryFilter(e) {
    const cat = e.currentTarget.dataset.category;
    const activeCategory = this.data.activeCategory === cat ? '' : cat;
    const filtered = activeCategory
      ? this.data.allWaypoints.filter(w => w.category === activeCategory)
      : this.data.allWaypoints;
    this.setData({ activeCategory, waypoints: filtered });
  },

  onWaypointTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  },

  // ── 管理 ──
  onOpenSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' });
  },

});
