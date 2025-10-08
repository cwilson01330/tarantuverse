# Growth Chart Issue: Deep Dive Analysis

## Executive Summary

The `GrowthChart` component using `victory-native` is currently disabled due to a fundamental incompatibility between **pnpm's module resolution strategy** and **dynamic `require()` calls** used by `@shopify/react-native-skia`. This document provides a complete technical analysis, explores all potential solutions, and recommends the best path forward.

---

## Technical Root Cause

### The Dependency Chain

```
mobile app
  └── victory-native@41.20.1
        └── @shopify/react-native-skia@2.3.0 (peer dependency)
              └── react-native-reanimated (optional peer dependency, loaded dynamically)
```

### The Problem: Dynamic require() + pnpm Symlinks

**File:** `@shopify/react-native-skia/lib/commonjs/external/reanimated/ReanimatedProxy.js`

```javascript
const Reanimated = createModuleProxy(() => {
  try {
    return require("react-native-reanimated");  // ❌ Dynamic require fails with pnpm
  } catch (e) {
    throw new OptionalDependencyNotInstalledError("react-native-reanimated");
  }
});
```

**Why it fails with pnpm:**

1. **pnpm's Isolation**: pnpm uses symlinks and a content-addressable store (`node_modules/.pnpm/`) to prevent phantom dependencies. Each package only has access to explicitly declared dependencies.

2. **Skia's Location**: 
   ```
   node_modules/.pnpm/@shopify+react-native-skia@2.3.0_react-native-reanimated@4.1.2/
     └── node_modules/
           └── @shopify/react-native-skia/
   ```

3. **Reanimated's Location** (different isolated directory):
   ```
   node_modules/.pnpm/react-native-reanimated@4.1.2_react-native@0.81.4/
     └── node_modules/
           └── react-native-reanimated/
   ```

4. **Module Resolution**: When Skia does `require("react-native-reanimated")`, Node.js looks in:
   - `@shopify/react-native-skia/node_modules/` ❌ Not there
   - `.pnpm/@shopify+react-native-skia@2.3.0/node_modules/` ❌ Not there (isolated)
   - Traverses up the directory tree ❌ Doesn't find it due to symlink isolation

5. **Why static imports work**: If Skia used `import Reanimated from 'react-native-reanimated'`, Metro bundler would resolve it at build time. But `require()` happens at runtime in the device's JavaScript engine.

### Failed Fix Attempts

| Attempt | Configuration | Result |
|---------|--------------|---------|
| 1 | Install `react-native-reanimated@4.1.2` | ❌ Installed but not resolvable by Skia |
| 2 | Add Reanimated plugin to `babel.config.js` | ❌ Only helps with Reanimated's own transforms |
| 3 | `.npmrc`: `public-hoist-pattern[]=*react-native-reanimated*` | ❌ Hoists to virtual store, not workspace root |
| 4 | `.npmrc`: `shamefully-hoist=true` | ❌ Still uses isolated stores |
| 5 | `.npmrc`: `node-linker=hoisted` | ⚠️ Caused duplicate React instances, "Invalid hook call" errors |
| 6 | Move `.npmrc` to workspace root | ❌ Same isolation issues persist |
| 7 | Full workspace reinstall (`pnpm install`) | ❌ Reinstalls with same architecture |

---

## Solution Options

### Option 1: Switch Package Manager to npm or yarn ⭐ **RECOMMENDED**

**Description**: Replace pnpm with npm or yarn, which use flat or less isolated node_modules structures.

**Pros:**
- ✅ Guarantees compatibility with all React Native packages
- ✅ Standard approach in React Native ecosystem
- ✅ Dynamic `require()` calls work normally
- ✅ No workarounds or compromises needed
- ✅ victory-native charts work out of the box

**Cons:**
- ⚠️ Larger `node_modules` size (~30-40% more disk space)
- ⚠️ Slightly slower installs (pnpm is fastest)
- ⚠️ More potential for phantom dependencies (less strict)
- ⚠️ Need to migrate existing setup

**Implementation Steps:**
1. Remove pnpm lock file: `rm pnpm-lock.yaml`
2. Remove `.npmrc` with pnpm config
3. Update scripts in `package.json` to use `npm` instead of `pnpm`
4. Run `npm install` (or `yarn install`)
5. Update CI/CD pipelines if any
6. Test all packages (api, web, mobile)
7. Uncommit GrowthChart component

**Estimated Time:** 1-2 hours

**Risk Level:** Low (standard practice)

---

### Option 2: Custom SVG Chart Component

**Description**: Build a lightweight chart using `react-native-svg` directly, avoiding complex dependencies.

**Pros:**
- ✅ Full control over chart appearance
- ✅ No third-party dependency issues
- ✅ Optimized for your specific use case (weight/leg span over time)
- ✅ Smaller bundle size
- ✅ Works with pnpm

**Cons:**
- ⚠️ Development time required (2-4 hours)
- ⚠️ Need to handle touch interactions, axis scaling, animations manually
- ⚠️ More maintenance burden
- ⚠️ Less feature-rich than victory-native

**Implementation Approach:**

```typescript
import React from 'react';
import { View, Text, Dimensions } from 'react-native';
import Svg, { Line, Circle, Polyline, Text as SvgText } from 'react-native-svg';

interface CustomChartProps {
  data: Array<{ x: number; y: number; label: string }>;
  width?: number;
  height?: number;
}

const CustomLineChart: React.FC<CustomChartProps> = ({ 
  data, 
  width = Dimensions.get('window').width - 40, 
  height = 200 
}) => {
  // Calculate scaling
  const maxY = Math.max(...data.map(d => d.y));
  const minY = Math.min(...data.map(d => d.y));
  const rangeY = maxY - minY || 1;
  
  const padding = 40;
  const chartWidth = width - 2 * padding;
  const chartHeight = height - 2 * padding;
  
  // Convert data points to SVG coordinates
  const points = data.map((point, index) => {
    const x = padding + (index / (data.length - 1)) * chartWidth;
    const y = padding + (1 - (point.y - minY) / rangeY) * chartHeight;
    return { x, y, label: point.label };
  });
  
  // Create polyline path
  const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  
  return (
    <View>
      <Svg width={width} height={height}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((percent) => {
          const y = padding + percent * chartHeight;
          return (
            <Line
              key={percent}
              x1={padding}
              y1={y}
              x2={width - padding}
              y2={y}
              stroke="#e0e0e0"
              strokeWidth="1"
            />
          );
        })}
        
        {/* Chart line */}
        <Polyline
          points={pathData}
          fill="none"
          stroke="#f97316"
          strokeWidth="2"
        />
        
        {/* Data points */}
        {points.map((point, index) => (
          <Circle
            key={index}
            cx={point.x}
            cy={point.y}
            r="4"
            fill="#f97316"
          />
        ))}
        
        {/* Y-axis labels */}
        {[maxY, (maxY + minY) / 2, minY].map((value, index) => {
          const y = padding + (index * chartHeight) / 2;
          return (
            <SvgText
              key={value}
              x={padding - 10}
              y={y + 4}
              fontSize="10"
              fill="#666"
              textAnchor="end"
            >
              {value.toFixed(1)}
            </SvgText>
          );
        })}
      </Svg>
      
      {/* X-axis labels (outside SVG for better text rendering) */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: padding }}>
        {data.map((point, index) => (
          index % Math.ceil(data.length / 4) === 0 && (
            <Text key={index} style={{ fontSize: 10, color: '#666' }}>
              {point.label}
            </Text>
          )
        ))}
      </View>
    </View>
  );
};
```

**Estimated Time:** 3-5 hours for full implementation with features

**Risk Level:** Low (no external dependencies)

---

### Option 3: Alternative Chart Libraries

**Description**: Replace victory-native with a library that doesn't depend on react-native-reanimated.

**Candidates:**

#### 3a. react-native-chart-kit

```bash
pnpm add react-native-chart-kit
```

```typescript
import { LineChart } from 'react-native-chart-kit';

<LineChart
  data={{
    labels: chartData.map(d => d.date),
    datasets: [{ data: chartData.map(d => d.weight || 0) }]
  }}
  width={Dimensions.get('window').width - 40}
  height={220}
  chartConfig={{
    backgroundColor: '#ffffff',
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    decimalPlaces: 1,
    color: (opacity = 1) => `rgba(249, 115, 22, ${opacity})`,
  }}
/>
```

**Pros:**
- ✅ Simple API, easy to use
- ✅ No Reanimated dependency
- ✅ Works with pnpm
- ✅ Multiple chart types

**Cons:**
- ⚠️ Less customizable than victory-native
- ⚠️ Uses `react-native-svg` (still a dependency, but simpler)
- ⚠️ Last updated ~1 year ago

#### 3b. react-native-svg-charts

```bash
pnpm add react-native-svg-charts
```

**Pros:**
- ✅ Very flexible with custom decorators
- ✅ No Reanimated dependency
- ✅ Built on `react-native-svg`

**Cons:**
- ⚠️ More verbose API
- ⚠️ Project seems less actively maintained
- ⚠️ Smaller community

**Estimated Time:** 1-2 hours for migration

**Risk Level:** Medium (dependency maintenance uncertainty)

---

### Option 4: Eject Skia's Reanimated Dependency (Patch)

**Description**: Use `patch-package` to modify Skia's code to skip reanimated loading.

**Implementation:**

1. Install patch-package:
```bash
pnpm add -D patch-package
```

2. Modify `node_modules/@shopify/react-native-skia/lib/commonjs/external/reanimated/ReanimatedProxy.js`:
```javascript
// Comment out the problematic require
const Reanimated = null; // Disabled for pnpm compatibility
```

3. Generate patch:
```bash
npx patch-package @shopify/react-native-skia
```

**Pros:**
- ✅ Keeps pnpm
- ✅ Keeps victory-native

**Cons:**
- ❌ Loses all Reanimated-powered animations in charts
- ❌ Patch must be maintained across updates
- ❌ Fragile solution
- ❌ May break other Skia features

**Risk Level:** High (not recommended)

---

## Comparison Matrix

| Solution | Time | Works with pnpm | Animation Support | Maintenance | Future-proof |
|----------|------|-----------------|-------------------|-------------|--------------|
| **Switch to npm/yarn** | 1-2h | ❌ | ✅ Full | Low | ✅ |
| **Custom SVG** | 3-5h | ✅ | ⚠️ Manual | Medium | ✅ |
| **react-native-chart-kit** | 1-2h | ✅ | ⚠️ Basic | Low | ⚠️ |
| **Patch Skia** | 1h | ✅ | ❌ None | High | ❌ |

---

## Recommendation

### Primary: Switch to npm (Option 1) ⭐

**Rationale:**
1. **Ecosystem Compatibility**: React Native ecosystem heavily relies on dynamic `require()` calls. Sticking with npm/yarn ensures compatibility with the broadest range of packages.

2. **Future-Proofing**: Other packages may have similar issues. npm/yarn eliminates an entire class of potential problems.

3. **Development Speed**: victory-native is a mature, well-documented library. Keeping it saves development time compared to building custom solutions.

4. **Animation Quality**: Reanimated-powered animations in charts are smooth and performant. Custom solutions would require significant effort to match this quality.

5. **Low Risk**: npm is the default package manager for Node.js. It's battle-tested and well-supported.

### Fallback: Custom SVG Chart (Option 2)

**When to use:**
- You strongly prefer to keep pnpm for its speed and disk efficiency
- You only need simple line charts (weight/leg span over time)
- You want zero third-party dependencies for charts

**Implementation Plan:**
1. Create `apps/mobile/src/components/CustomLineChart.tsx`
2. Implement basic line chart with SVG
3. Add touch interactions for data point details
4. Replace GrowthChart's victory-native components with custom component

---

## Next Steps

### If choosing Option 1 (npm migration):

1. **Backup current state:**
   ```bash
   git add .
   git commit -m "Pre-npm-migration checkpoint"
   ```

2. **Remove pnpm artifacts:**
   ```bash
   rm pnpm-lock.yaml
   rm .npmrc
   rm -rf node_modules
   ```

3. **Update package manager references:**
   - Update GitHub Actions workflows
   - Update local scripts
   - Update documentation

4. **Install with npm:**
   ```bash
   npm install
   ```

5. **Test all workspaces:**
   ```bash
   cd apps/api && npm run start
   cd apps/web && npm run dev
   cd apps/mobile && npx expo start
   ```

6. **Re-enable GrowthChart:**
   - Uncomment import in `apps/mobile/app/tarantula/[id].tsx`
   - Uncomment render block
   - Test on device

### If choosing Option 2 (Custom SVG):

1. **Create component file:**
   ```bash
   touch apps/mobile/src/components/CustomLineChart.tsx
   ```

2. **Implement basic version** (use code template above)

3. **Replace GrowthChart usage:**
   ```typescript
   import CustomLineChart from '../../src/components/CustomLineChart';
   
   // Transform data for custom chart
   const chartData = growthData.data_points.map((point, index) => ({
     x: index,
     y: point.weight || point.leg_span || 0,
     label: format(new Date(point.date), 'MMM d')
   }));
   
   <CustomLineChart data={chartData} />
   ```

4. **Iterate on features:**
   - Add date range filters
   - Add metric toggle (weight vs leg span)
   - Add touch interactions

---

## References

- **pnpm documentation**: https://pnpm.io/motivation
- **React Native + pnpm issues**: https://github.com/facebook/react-native/issues/28400
- **Skia source code**: https://github.com/Shopify/react-native-skia
- **victory-native**: https://commerce.nearform.com/open-source/victory-native
- **react-native-chart-kit**: https://github.com/indiespirit/react-native-chart-kit

---

## Appendix: Why This Matters

Growth charts are a **supplementary feature**, not core functionality. The feeding analytics (which work perfectly) are the primary value of Week 2. However, charts significantly enhance user experience by:

1. **Visual Pattern Recognition**: Seeing growth trends at a glance
2. **Data Validation**: Spotting anomalies or data entry errors
3. **Long-term Tracking**: Observing molting cycles and growth rates over months/years
4. **Comparison**: Comparing growth between different tarantulas

The investment in fixing charts (1-5 hours depending on solution) is worth it for the **long-term UX value** they provide.

---

## 🎉 UPDATE: Solution Successfully Implemented

**Date:** October 7, 2025  
**Solution Chosen:** Option 3 - Alternative Chart Library (`react-native-chart-kit`)  
**Time Investment:** ~1-2 hours  
**Result:** ✅ Charts working perfectly with pnpm

### Implementation Summary

**What We Did:**
- Replaced `victory-native@41.20.1` with `react-native-chart-kit@6.12.0`
- Complete rewrite of `GrowthChart.tsx` (~207 lines changed)
- Removed dependency chain: victory-native → @shopify/react-native-skia → react-native-reanimated
- New dependency chain: react-native-chart-kit → react-native-svg (already installed)

**Why This Worked:**
1. **No Dynamic Requires**: `react-native-chart-kit` uses only static imports
2. **Simpler Dependencies**: Only depends on `react-native-svg`, no reanimated or skia
3. **pnpm Compatible**: All dependencies resolve correctly in pnpm's isolated node_modules
4. **Same Features**: Preserved all chart functionality (metric toggles, date filters, bezier curves)

**Files Changed:**
- `apps/mobile/package.json` - Added chart-kit, removed victory-native
- `apps/mobile/src/components/GrowthChart.tsx` - Migrated from VictoryChart to LineChart
- `apps/mobile/app/tarantula/[id].tsx` - Re-enabled GrowthChart component

**Visual Results:**
- Weight chart: Green (#10b981) with bezier curves
- Leg span chart: Blue (#3b82f6) with bezier curves  
- Dot markers, grid lines, auto-scaling Y-axis
- All toggles and filters working correctly

### Key Learnings

**For Future Library Selection in pnpm Monorepos:**
1. ✅ **DO**: Choose libraries with simple, static dependency chains
2. ✅ **DO**: Prefer libraries that only use static `import` statements
3. ❌ **AVOID**: Libraries with dynamic `require()` for optional dependencies
4. ❌ **AVOID**: Deep dependency chains involving reanimated or skia unless necessary

**Migration Effort:**
- Victory API: Single `VictoryChart` with multiple `VictoryLine` components
- Chart-kit API: Separate `LineChart` per metric with `chartConfig` objects
- Data format change: `{x, weight, legSpan}` → `{labels: [], datasets: [{data: []}]}`
- All features preserved with minimal code changes

### Recommendation

For React Native projects using pnpm, **always verify** that charting libraries:
- Have explicit, static imports
- Don't rely on optional peer dependencies loaded via dynamic requires
- Work in isolated node_modules environments

`react-native-chart-kit` is an excellent choice for pnpm monorepos due to its simplicity and compatibility.

---

**Document Version:** 1.1  
**Last Updated:** October 7, 2025 (Solution Implemented)  
**Author:** Development Team
