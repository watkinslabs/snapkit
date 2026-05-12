/**
 * Shared geometry model for layout picker sizing.
 *
 * Ensures picker templates:
 * - Use monitor aspect ratio
 * - Scale to fit monitor bounds on the configured edge
 * - Expose consistent span metrics for hot-edge hitbox sizing
 */

const DEFAULT_THUMBNAIL_WIDTH = 120;
const DEFAULT_THUMBNAIL_HEIGHT = 80;
const DEFAULT_SPACING = 12;
const DEFAULT_BAR_PADDING = 16;
const DEFAULT_EDGE_OFFSET = 8;
const DEFAULT_PADDING = 8;

const DEFAULT_LABEL_HEIGHT = 20;
const DEFAULT_LABEL_GAP = 6;
const DEFAULT_LABEL_FONT_SIZE = 11;
const MIN_VISIBLE_LABEL_FONT = 8;

function _positive(value, fallback) {
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function _nonNegative(value, fallback) {
    return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function _isVerticalEdge(edge) {
    return edge === 'left' || edge === 'right';
}

function _measureBar({
    isVertical,
    layoutCount,
    thumbnailWidth,
    itemHeight,
    barPadding,
    spacing
}) {
    const gapTotal = Math.max(0, layoutCount - 1) * spacing;

    if (isVertical) {
        return {
            barWidth: barPadding * 2 + thumbnailWidth,
            barHeight: barPadding * 2 + layoutCount * itemHeight + gapTotal
        };
    }

    return {
        barWidth: barPadding * 2 + layoutCount * thumbnailWidth + gapTotal,
        barHeight: barPadding * 2 + itemHeight
    };
}

/**
 * Compute layout picker render metrics for a monitor/edge combination.
 *
 * @param {Object} params
 * @param {Object} params.monitorGeometry - {width, height}
 * @param {string} params.edge - top|bottom|left|right
 * @param {number} params.layoutCount
 * @param {Object} params.config - Picker config subset
 * @returns {Object}
 */
export function computeLayoutPickerMetrics({
    monitorGeometry = {},
    edge = 'top',
    layoutCount = 1,
    config = {}
} = {}) {
    const monitorWidth = _positive(monitorGeometry.width, 1920);
    const monitorHeight = _positive(monitorGeometry.height, 1080);
    const safeLayoutCount = Math.max(1, Math.floor(_positive(layoutCount, 1)));

    const thumbnailWidthCfg = _positive(config.thumbnailWidth, DEFAULT_THUMBNAIL_WIDTH);
    const thumbnailHeightCfg = _positive(config.thumbnailHeight, DEFAULT_THUMBNAIL_HEIGHT);
    const spacingCfg = _nonNegative(config.spacing, DEFAULT_SPACING);
    const barPaddingCfg = _nonNegative(config.barPadding, DEFAULT_BAR_PADDING);
    const edgeOffsetCfg = _nonNegative(config.edgeOffset, DEFAULT_EDGE_OFFSET);
    const paddingCfg = _nonNegative(config.padding, DEFAULT_PADDING);

    const isVertical = _isVerticalEdge(edge);

    // Match thumbnail ratio to monitor ratio.
    const aspectRatio = Math.max(0.2, Math.min(5, monitorWidth / monitorHeight));
    const baseThumbnailHeight = Math.max(
        1,
        Math.floor(Math.min(thumbnailHeightCfg, thumbnailWidthCfg / aspectRatio))
    );
    const baseThumbnailWidth = Math.max(1, Math.floor(baseThumbnailHeight * aspectRatio));

    const labelBlockFactor = (DEFAULT_LABEL_HEIGHT + DEFAULT_LABEL_GAP) / Math.max(1, thumbnailHeightCfg);
    const baseLabelBlock = Math.max(0, baseThumbnailHeight * labelBlockFactor);
    const baseItemHeight = baseThumbnailHeight + baseLabelBlock;

    // Cross-axis limits account for edge offset in expanded position.
    const availableWidth = Math.max(1, monitorWidth - (isVertical ? edgeOffsetCfg : 0));
    const availableHeight = Math.max(1, monitorHeight - (isVertical ? 0 : edgeOffsetCfg));

    const base = _measureBar({
        isVertical,
        layoutCount: safeLayoutCount,
        thumbnailWidth: baseThumbnailWidth,
        itemHeight: baseItemHeight,
        barPadding: barPaddingCfg,
        spacing: spacingCfg
    });

    const spanLimit = isVertical ? availableHeight : availableWidth;
    const crossLimit = isVertical ? availableWidth : availableHeight;
    const baseSpan = isVertical ? base.barHeight : base.barWidth;
    const baseCross = isVertical ? base.barWidth : base.barHeight;

    let scale = Math.min(1, spanLimit / Math.max(1, baseSpan), crossLimit / Math.max(1, baseCross));
    if (!Number.isFinite(scale) || scale <= 0) {
        scale = 0.05;
    }

    let barPadding = Math.max(0, Math.floor(barPaddingCfg * scale));
    let spacing = Math.max(0, Math.floor(spacingCfg * scale));
    let thumbnailHeight = Math.max(1, Math.floor(baseThumbnailHeight * scale));
    let thumbnailWidth = Math.max(1, Math.floor(thumbnailHeight * aspectRatio));
    let labelBlock = Math.max(0, Math.floor(baseLabelBlock * scale));
    let labelGap = Math.min(labelBlock, Math.max(0, Math.floor(DEFAULT_LABEL_GAP * scale)));
    let labelHeight = Math.max(0, labelBlock - labelGap);
    let labelFontSize = Math.max(MIN_VISIBLE_LABEL_FONT, Math.floor(DEFAULT_LABEL_FONT_SIZE * scale));
    let showLabels = labelHeight >= MIN_VISIBLE_LABEL_FONT && labelFontSize >= MIN_VISIBLE_LABEL_FONT;

    if (!showLabels) {
        labelGap = 0;
        labelHeight = 0;
        labelFontSize = 0;
    }

    let itemHeight = thumbnailHeight + (showLabels ? labelGap + labelHeight : 0);
    let measured = _measureBar({
        isVertical,
        layoutCount: safeLayoutCount,
        thumbnailWidth,
        itemHeight,
        barPadding,
        spacing
    });

    const widthLimit = isVertical ? availableWidth : monitorWidth;
    const heightLimit = isVertical ? monitorHeight : availableHeight;

    // Integer rounding can still overshoot slightly; trim down deterministically.
    while ((measured.barWidth > widthLimit || measured.barHeight > heightLimit) && thumbnailHeight > 1) {
        thumbnailHeight -= 1;
        thumbnailWidth = Math.max(1, Math.floor(thumbnailHeight * aspectRatio));

        const sizeScale = thumbnailHeight / Math.max(1, baseThumbnailHeight);
        labelBlock = Math.max(0, Math.floor(baseLabelBlock * sizeScale));
        labelGap = Math.min(labelBlock, Math.max(0, Math.floor(DEFAULT_LABEL_GAP * sizeScale)));
        labelHeight = Math.max(0, labelBlock - labelGap);
        labelFontSize = Math.max(MIN_VISIBLE_LABEL_FONT, Math.floor(DEFAULT_LABEL_FONT_SIZE * sizeScale));
        showLabels = labelHeight >= MIN_VISIBLE_LABEL_FONT && labelFontSize >= MIN_VISIBLE_LABEL_FONT;

        if (!showLabels) {
            labelGap = 0;
            labelHeight = 0;
            labelFontSize = 0;
        }

        if (barPadding > 0) {
            barPadding -= 1;
        }
        if (spacing > 0 && safeLayoutCount > 1) {
            spacing -= 1;
        }

        itemHeight = thumbnailHeight + (showLabels ? labelGap + labelHeight : 0);
        measured = _measureBar({
            isVertical,
            layoutCount: safeLayoutCount,
            thumbnailWidth,
            itemHeight,
            barPadding,
            spacing
        });
    }

    // Last-resort clamp for extreme template counts.
    if (measured.barWidth > widthLimit || measured.barHeight > heightLimit) {
        barPadding = 0;
        spacing = 0;
        showLabels = false;
        labelGap = 0;
        labelHeight = 0;
        labelFontSize = 0;
        itemHeight = thumbnailHeight;
        measured = _measureBar({
            isVertical,
            layoutCount: safeLayoutCount,
            thumbnailWidth,
            itemHeight,
            barPadding,
            spacing
        });
    }

    return {
        isVertical,
        aspectRatio,
        scale,
        thumbnailWidth,
        thumbnailHeight,
        labelGap,
        labelHeight,
        labelFontSize,
        showLabels,
        barPadding,
        spacing,
        itemHeight,
        barWidth: measured.barWidth,
        barHeight: measured.barHeight,
        edgeSpan: isVertical ? measured.barHeight : measured.barWidth,
        resolverPadding: Math.max(0, Math.floor((paddingCfg / 4) * scale))
    };
}
