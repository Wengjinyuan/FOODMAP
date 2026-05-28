const app = getApp();
const BASE_CATS = ['美食','咖啡','风景','根据地','购物','娱乐','其他'];
const DEFAULT_TAGS = ['好吃', '推荐', '回头客', '环境好', '性价比高', '难找', '深夜档'];

Page({
  data: {
    tab: 'cards',
    cards: [], tags: [], categories: [],   // categories: [{name, count}]
    checked: {},
    search: '',
  },

  onLoad() {
    const capsule = wx.getMenuButtonBoundingClientRect();
    const { windowWidth } = wx.getWindowInfo();
    const scale = 750 / windowWidth;
    this.setData({ navTop: (capsule.bottom + 8) * scale });
    this.loadAll();
  },

  onBack() { wx.navigateBack(); },

  loadAll() {
    const db = app.getDb();
    if (!db) return;
    db.collection('waypoints').limit(1000).get().then((res) => {
      const emojiMap = { '美食':'🍜','咖啡':'☕','风景':'🏔️','根据地':'🏠','购物':'🛍️','娱乐':'🎮','其他':'📍' };
      (res.data || []).forEach(wp => {
        const c0 = (wp.categories && wp.categories[0]) || wp.category || '其他';
        wp.categoryEmoji = emojiMap[c0] || '📍';
        wp.categories = wp.categories || (wp.category ? [wp.category] : ['其他']);
      });
      const cards = res.data || [];
      const tagSet = new Set();
      const catMap = new Map();
      const storedCats = wx.getStorageSync('customCategories') || [];
      const storedTags = wx.getStorageSync('customTags') || [];
      [...BASE_CATS, ...storedCats].forEach(c => catMap.set(c, 0));
      [...DEFAULT_TAGS, ...storedTags].forEach(t => tagSet.add(t));
      cards.forEach(w => {
        (w.tags||[]).forEach(t => tagSet.add(t));
        (w.categories||[]).forEach(c => catMap.set(c, (catMap.get(c)||0) + 1));
      });
      const categories = [...catMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => (a.name === '其他' ? 1 : b.name === '其他' ? -1 : 0));
      this.setData({ cards, categories, tags: [...tagSet], checked: {}, search: '' });
      this.applyFilter();
    });
  },

  switchTab(e) { this.setData({ tab: e.currentTarget.dataset.tab, checked: {}, search: '' }, () => this.applyFilter()); },

  toggleCheck(e) {
    const key = e.currentTarget.dataset.key;
    const checked = { ...this.data.checked };
    checked[key] = !checked[key];
    this.setData({ checked });
  },

  toggleAll() {
    const list = this.data.tab === 'cards' ? this.data.cards :
                 this.data.tab === 'tags' ? this.data.tags : this.data.categories;
    const allChecked = list.every(item => {
      const key = this.data.tab === 'cards' ? item._id : this.data.tab === 'categories' ? item.name : item;
      return this.data.checked[key];
    });
    const checked = { ...this.data.checked };
    list.forEach(item => {
      const key = this.data.tab === 'cards' ? item._id : this.data.tab === 'categories' ? item.name : item;
      checked[key] = !allChecked;
    });
    this.setData({ checked });
  },

  batchDelete() {
    const db = app.getDb();
    if (!db) return;
    const checkedKeys = Object.entries(this.data.checked).filter(([,v])=>v).map(([k])=>k);
    if (checkedKeys.length === 0) return wx.showToast({ title: '请先勾选', icon: 'none' });
    wx.showModal({
      title: '确认删除 ' + checkedKeys.length + ' 项？', content: '不可恢复',
      confirmColor: '#FF6B6B',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...' });
        if (this.data.tab === 'cards') {
          wx.cloud.callFunction({ name: 'waypointFunctions', data: { action: 'batchDeleteWaypoints', ids: checkedKeys } })
            .then(({ result }) => {
              wx.hideLoading();
              wx.showToast({ title: '已删除 ' + (result.data ? result.data.deleted : 0) + ' 项', icon: 'success' });
              this.loadAll();
            }).catch(() => { wx.hideLoading(); wx.showToast({ title: '删除失败', icon: 'none' }); });
        } else if (this.data.tab === 'tags') {
          const remainingDefaults = DEFAULT_TAGS.filter(t => !checkedKeys.includes(t));
          if (remainingDefaults.length < 3) { wx.hideLoading(); return wx.showToast({ title: '默认标签至少保留3个', icon: 'none' }); }
          const storedTags = (wx.getStorageSync('customTags') || []).filter(t => !checkedKeys.includes(t));
          wx.setStorageSync('customTags', storedTags);
          wx.cloud.callFunction({ name: 'waypointFunctions', data: { action: 'batchRemoveTags', tags: checkedKeys } })
            .then(() => { wx.hideLoading(); wx.showToast({ title: '已删除', icon: 'success' }); this.loadAll(); })
            .catch(() => { wx.hideLoading(); wx.showToast({ title: '删除失败', icon: 'none' }); });
        } else {
          const remainingDefaults = BASE_CATS.filter(c => !checkedKeys.includes(c));
          if (remainingDefaults.length < 3) { wx.hideLoading(); return wx.showToast({ title: '默认分类至少保留3个', icon: 'none' }); }
          const stored = (wx.getStorageSync('customCategories') || []).filter(c => !checkedKeys.includes(c));
          wx.setStorageSync('customCategories', stored);
          wx.cloud.callFunction({ name: 'waypointFunctions', data: { action: 'batchRemoveCategories', categories: checkedKeys } })
            .then(() => { wx.hideLoading(); wx.showToast({ title: '已删除', icon: 'success' }); this.loadAll(); })
            .catch(() => { wx.hideLoading(); wx.showToast({ title: '删除失败', icon: 'none' }); });
        }
      },
    });
  },

  addItem() {
    const isTag = this.data.tab === 'tags';
    wx.showModal({
      title: '新增' + (isTag ? '标签' : '分类'),
      editable: true, placeholderText: '输入名称',
      success: (res) => {
        if (!res.content || !res.content.trim()) return;
        const name = res.content.trim();
        const key = isTag ? 'customTags' : 'customCategories';
        const stored = wx.getStorageSync(key) || [];
        if (stored.includes(name)) return wx.showToast({ title: '已存在', icon: 'none' });
        stored.push(name);
        wx.setStorageSync(key, stored);
        const update = isTag
          ? { tags: [...this.data.tags, name] }
          : { categories: [...this.data.categories, { name, count: 0 }] };
        this.setData(update, () => { this.applyFilter(); });
        wx.showToast({ title: '已添加', icon: 'success' });
      },
    });
  },

  renameItem(e) {
    const old = e.currentTarget.dataset.name;
    wx.showModal({
      title: '重命名',
      editable: true, placeholderText: '新名称', content: old,
      success: (res) => {
        if (!res.content || !res.content.trim() || res.content.trim() === old) return;
        const nn = res.content.trim();
        if (this.data.tab === 'tags') {
          wx.cloud.callFunction({ name: 'waypointFunctions', data: { action: 'batchRenameTag', oldName: old, newName: nn } })
            .then(() => {
              const tagStored = (wx.getStorageSync('customTags') || []);
              const tagIdx = tagStored.indexOf(old);
              if (tagIdx > -1) tagStored[tagIdx] = nn; else tagStored.push(nn);
              wx.setStorageSync('customTags', tagStored);
              this.loadAll();
            }).catch(() => { wx.showToast({ title: '重命名失败', icon: 'none' }); });
        } else {
          wx.cloud.callFunction({ name: 'waypointFunctions', data: { action: 'batchRenameCategory', oldName: old, newName: nn } })
            .then(() => {
              const catStored = (wx.getStorageSync('customCategories') || []);
              const catIdx = catStored.indexOf(old);
              if (catIdx > -1) catStored[catIdx] = nn; else catStored.push(nn);
              wx.setStorageSync('customCategories', catStored);
              this.loadAll();
            }).catch(() => { wx.showToast({ title: '重命名失败', icon: 'none' }); });
        }
      },
    });
  },

  onSearch(e) {
    const search = e.detail.value || '';
    this.setData({ search });
    this.applyFilter();
  },

  applyFilter() {
    const { tab, cards, tags, categories, search } = this.data;
    const s = (search || '').trim().toLowerCase();
    let filteredCards = cards, filteredTags = tags, filteredCategories = categories;
    if (s) {
      filteredCards = cards.filter(c => c.name.toLowerCase().includes(s) || (c.categories||[]).some(cat => cat.toLowerCase().includes(s)) || (c.category||'').toLowerCase().includes(s));
      filteredTags = tags.filter(t => t.toLowerCase().includes(s));
      filteredCategories = categories.filter(c => c.name.toLowerCase().includes(s));
    }
    this.setData({ filteredCards, filteredTags, filteredCategories });
  },

});
