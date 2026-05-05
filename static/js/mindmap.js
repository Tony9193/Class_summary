/**
 * 思维导图渲染模块
 * 使用 D3.js 实现可交互的树形思维导图
 */

const Mindmap = {
    svg: null,
    g: null,
    zoom: null,
    treeLayout: null,
    root: null,
    _currentData: null,
    width: 800,
    height: 500,
    margin: { top: 20, right: 150, bottom: 20, left: 150 },

    /**
     * 初始化思维导图容器
     */
    init(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        this.width = container.clientWidth || 800;
        this.height = container.clientHeight || 500;

        container.innerHTML = '';

        this.svg = d3.select(container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', `0 0 ${this.width} ${this.height}`);

        this.g = this.svg.append('g');

        this.zoom = d3.zoom()
            .scaleExtent([0.2, 3])
            .on('zoom', (event) => {
                this.g.attr('transform', event.transform);
            });

        this.svg.call(this.zoom);

        this.treeLayout = d3.tree()
            .nodeSize([40, 200])
            .separation((a, b) => (a.parent === b.parent ? 1 : 1.3));
    },

    /**
     * 计算文字宽度（近似）
     */
    _getTextWidth(text, fontSize) {
        let len = 0;
        for (const ch of text) {
            len += /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch) ? 1 : 0.55;
        }
        return len * fontSize;
    },

    /**
     * 渲染思维导图
     */
    render(data) {
        if (!this.svg || !data) return;

        this._currentData = data;
        this.root = d3.hierarchy(data);
        this.treeLayout(this.root);

        this.g.selectAll('*').remove();

        const FONT_SIZE_ROOT = 15;
        const FONT_SIZE_NODE = 13;
        const PAD_X = 16;
        const PAD_Y = 8;
        const RX = 6;

        // 绘制连线
        this.g.selectAll('.mindmap-link')
            .data(this.root.links())
            .enter()
            .append('path')
            .attr('class', 'mindmap-link')
            .attr('fill', 'none')
            .attr('stroke', '#CBD5E1')
            .attr('stroke-width', 1.5)
            .attr('stroke-opacity', 0.6)
            .attr('d', d => {
                const sx = d.source.y, sy = d.source.x;
                const tx = d.target.y, ty = d.target.x;
                const mx = (sx + tx) / 2;
                return `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`;
            });

        // 绘制节点组
        const nodes = this.g.selectAll('.mindmap-node')
            .data(this.root.descendants())
            .enter()
            .append('g')
            .attr('class', d => `mindmap-node ${d.children ? 'node-internal' : 'node-leaf'}`)
            .attr('transform', d => `translate(${d.y},${d.x})`)
            .on('click', (event, d) => {
                event.stopPropagation();
                this._toggleNode(d);
                this.render(data);
            });

        // 矩形背景
        nodes.each(function(d) {
            const g = d3.select(this);
            const isRoot = d.depth === 0;
            const fontSize = isRoot ? FONT_SIZE_ROOT : FONT_SIZE_NODE;
            const textW = Mindmap._getTextWidth(d.data.title, fontSize);
            const rectW = textW + PAD_X * 2;
            const rectH = fontSize + PAD_Y * 2;

            // 背景矩形
            g.append('rect')
                .attr('x', -rectW / 2)
                .attr('y', -rectH / 2)
                .attr('width', rectW)
                .attr('height', rectH)
                .attr('rx', RX)
                .attr('ry', RX)
                .attr('fill', isRoot ? '#EADDFF' : d.depth === 1 ? '#E8DEF8' : d.depth === 2 ? '#F2ECFA' : '#F6F2FA')
                .attr('stroke', isRoot ? '#6750A4' : d.depth === 1 ? '#625B71' : '#CAC4D0')
                .attr('stroke-width', isRoot ? 2 : 1)
                .attr('cursor', 'pointer');

            // 文字
            g.append('text')
                .attr('x', 0)
                .attr('y', 0)
                .attr('dy', '0.35em')
                .attr('text-anchor', 'middle')
                .attr('font-size', fontSize + 'px')
                .attr('font-weight', isRoot ? '600' : d.depth === 1 ? '500' : '400')
                .attr('fill', isRoot ? '#21005D' : '#1C1B1F')
                .attr('pointer-events', 'none')
                .text(d.data.title);

            // 折叠指示
            if (d.children && d.data._collapsed) {
                const badgeX = rectW / 2 + 10;
                g.append('circle')
                    .attr('cx', badgeX)
                    .attr('cy', 0)
                    .attr('r', 9)
                    .attr('fill', '#6750A4')
                    .attr('cursor', 'pointer');

                g.append('text')
                    .attr('x', badgeX)
                    .attr('y', 0)
                    .attr('dy', '0.35em')
                    .attr('text-anchor', 'middle')
                    .attr('font-size', '10px')
                    .attr('font-weight', '500')
                    .attr('fill', 'white')
                    .attr('pointer-events', 'none')
                    .text(d._children ? d._children.length : '');
            }

            // 解析按钮（非根节点才显示）
            if (d.depth > 0) {
                const btnX = -rectW / 2 - 14;
                g.append('circle')
                    .attr('class', 'explain-btn')
                    .attr('cx', btnX)
                    .attr('cy', 0)
                    .attr('r', 8)
                    .attr('fill', '#E8DEF8')
                    .attr('stroke', '#6750A4')
                    .attr('stroke-width', 1)
                    .attr('cursor', 'pointer')
                    .on('click', function(event) {
                        event.stopPropagation();
                        if (typeof openExplainDialog === 'function') {
                            openExplainDialog(d.data.title);
                        }
                    });

                g.append('text')
                    .attr('x', btnX)
                    .attr('y', 0)
                    .attr('dy', '0.35em')
                    .attr('text-anchor', 'middle')
                    .attr('font-size', '10px')
                    .attr('fill', '#6750A4')
                    .attr('pointer-events', 'none')
                    .text('?');
            }
        });

        // 悬停高亮
        nodes.selectAll('rect')
            .on('mouseover', function() {
                d3.select(this).attr('stroke-width', 2.5);
            })
            .on('mouseout', function(event, d) {
                d3.select(this).attr('stroke-width', d.depth === 0 ? 2 : 1);
            });

        this._fitToContent();
    },

    _toggleNode(d) {
        if (d.children) {
            d.data._collapsed = !d.data._collapsed;
            if (d.data._collapsed) {
                d._children = d.children;
                d.children = null;
            } else {
                d.children = d._children;
                d._children = null;
            }
        }
    },

    _fitToContent() {
        if (!this.root) return;

        const nodes = this.root.descendants();
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        nodes.forEach(d => {
            if (d.x < minX) minX = d.x;
            if (d.x > maxX) maxX = d.x;
            if (d.y < minY) minY = d.y;
            if (d.y > maxY) maxY = d.y;
        });

        const contentW = maxY - minY + 300;
        const contentH = maxX - minX + 100;

        const scaleX = this.width / contentW;
        const scaleY = this.height / contentH;
        const scale = Math.min(scaleX, scaleY, 1.2);

        const cx = this.width / 2;
        const cy = this.height / 2;

        const tx = cx - (minY + maxY) / 2 * scale;
        const ty = cy - (minX + maxX) / 2 * scale;

        this.svg.transition()
            .duration(500)
            .call(
                this.zoom.transform,
                d3.zoomIdentity.translate(tx, ty).scale(scale)
            );
    },

    resetView() {
        if (!this.svg) return;
        this.svg.transition()
            .duration(500)
            .call(
                this.zoom.transform,
                d3.zoomIdentity.translate(this.width / 2, this.height / 2).scale(1)
            );
    },

    expandAll() {
        if (!this.root || !this._currentData) return;
        this._expandAllNodes(this._currentData);
        this.render(this._currentData);
    },

    collapseAll() {
        if (!this.root || !this._currentData) return;
        this._collapseAllNodes(this._currentData);
        this.render(this._currentData);
    },

    _expandAllNodes(node) {
        node._collapsed = false;
        if (node.children) {
            node.children.forEach(child => this._expandAllNodes(child));
        }
    },

    _collapseAllNodes(node) {
        if (node.children && node.children.length > 0) {
            node._collapsed = true;
            node.children.forEach(child => this._collapseAllNodes(child));
        }
    }
};
