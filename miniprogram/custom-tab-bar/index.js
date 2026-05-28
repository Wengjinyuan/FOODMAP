Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/home/home', text: '🗺️ 地图' },
      { pagePath: '/pages/square/square', text: '🌐 广场' },
      { pagePath: '/pages/mine/mine', text: '👤 我的' },
    ],
  },
  methods: {
    switchTab(e) {
      const index = e.currentTarget.dataset.index;
      if (index !== this.data.selected) {
        wx.switchTab({ url: this.data.list[index].pagePath });
      }
    },
  },
});
