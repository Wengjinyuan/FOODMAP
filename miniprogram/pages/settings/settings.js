const app = getApp();

Page({
  data: {
    tab: 'cards',  // cards | tags | categories
    cards: [], tags: [], categories: [],
    checked: {},
  },

  onLoad() {
    const capsule = wx.getMenuButtonBoundingClientRect();
    const scale = 750 / wx.getSystemInfoSync().windowWidth;
    this.setData({ navTop: (capsule.bottom + 8) * scale });
    this.loadAll();
  },
  onBack() { wx.navigateBack(); },

  loadAll() {
    const db = app.getDb();
    if (!db) return;
    db.collection('waypoints').limit(1000).get().then((res) => {
      const cards = res.data || [];
      const tagSet = new Set();
      const catSet = new Set(['美食','咖啡','风景','根据地','购物','娱乐','其他']);
      cards.forEach(w => { (w.tags||[]).forEach(t=>tagSet.add(t)); if(w.category) catSet.add(w.category); });
      this.setData({
        cards,
        tags: [...tagSet],
        categories: [...catSet],
        checked: {},
      });
    });
  },

  // Tab switch
  switchTab(e) { this.setData({ tab: e.currentTarget.dataset.tab, checked: {} }); },

  // Checkbox toggle
  toggleCheck(e) {
    const key = e.currentTarget.dataset.key;
    const checked = { ...this.data.checked };
    checked[key] = !checked[key];
    this.setData({ checked });
  },

  toggleAll() {
    const list = this.data.tab === 'cards' ? this.data.cards :
                 this.data.tab === 'tags' ? this.data.tags :
                 this.data.categories;
    const allChecked = list.every(item => {
      const key = this.data.tab === 'cards' ? item._id : item;
      return this.data.checked[key];
    });
    const checked = { ...this.data.checked };
    list.forEach(item => {
      const key = this.data.tab === 'cards' ? item._id : item;
      checked[key] = !allChecked;
    });
    this.setData({ checked });
  },

  // Batch delete
  batchDelete() {
    const db = app.getDb();
    if (!db) return;
    const checkedKeys = Object.entries(this.data.checked).filter(([,v])=>v).map(([k])=>k);
    if (checkedKeys.length === 0) return wx.showToast({ title: '请先勾选', icon: 'none' });

    wx.showModal({
      title: '确认删除',
      content: '将删除 ' + checkedKeys.length + ' 项，不可恢复',
      confirmColor: '#FF6B6B',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...' });
        if (this.data.tab === 'cards') {
          const tasks = checkedKeys.map(id => db.collection('waypoints').doc(id).remove());
          Promise.all(tasks).then(() => { wx.hideLoading(); wx.showToast({ title: '已删除', icon: 'success' }); this.loadAll(); });
        } else if (this.data.tab === 'tags') {
          this.batchDeleteTags(checkedKeys, db);
        } else {
          this.batchDeleteCategories(checkedKeys, db);
        }
      },
    });
  },

  batchDeleteTags(tags, db) {
    const _ = db.command;
    db.collection('waypoints').where({ tags: _.in(tags) }).get().then((res) => {
      const tasks = (res.data||[]).map(wp => db.collection('waypoints').doc(wp._id).update({
        data: { tags: (wp.tags||[]).filter(t => !tags.includes(t)) }
      }));
      return Promise.all(tasks);
    }).then(() => { wx.hideLoading(); wx.showToast({ title: '已删除', icon: 'success' }); this.loadAll(); });
  },

  batchDeleteCategories(cats, db) {
    const _ = db.command;
    // Keep at least '其他'
    const remaining = this.data.categories.filter(c => !cats.includes(c));
    if (remaining.length < 1) { wx.hideLoading(); return wx.showToast({ title: '至少保留1个分类', icon: 'none' }); }
    db.collection('waypoints').where({ category: _.in(cats) }).get().then((res) => {
      const tasks = (res.data||[]).map(wp => db.collection('waypoints').doc(wp._id).update({
        data: { category: '其他' }
      }));
      return Promise.all(tasks);
    }).then(() => { wx.hideLoading(); wx.showToast({ title: '已删除', icon: 'success' }); this.loadAll(); });
  },

  // Add tag
  addTag() {
    wx.showModal({
      title: '添加标签',
      editable: true,
      placeholderText: '新标签名称',
      success: (res) => {
        if (!res.content || !res.content.trim()) return;
        const tag = res.content.trim();
        if (this.data.tags.includes(tag)) return wx.showToast({ title: '已存在', icon: 'none' });
        this.setData({ tags: [...this.data.tags, tag] });
      },
    });
  },

  // Add category
  addCategory() {
    wx.showModal({
      title: '添加分类',
      editable: true,
      placeholderText: '新分类名称',
      success: (res) => {
        if (!res.content || !res.content.trim()) return;
        const cat = res.content.trim();
        if (this.data.categories.includes(cat)) return wx.showToast({ title: '已存在', icon: 'none' });
        this.setData({ categories: [...this.data.categories, cat] });
      },
    });
  },
});
