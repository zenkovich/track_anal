# 🏁 Track Tools

A professional GPS track visualization and analysis tool for VBO files.

![Demo](demo.png)

## ✨ Features

- 🗺️ **GPS Track Visualization** - Display tracks on Google Maps satellite imagery
- 🏁 **Automatic Lap Detection** - Intelligent start/finish line detection with precise lap splitting
- 🎨 **Multiple Laps** - Each lap rendered in a different color
- 📊 **Lap Statistics** - Distance, time, and maximum speed for each lap
- 🔍 **Interactive Controls** - Mouse wheel zoom, drag to pan
- 📈 **Comparison Charts** - Compare laps by velocity, time, and deltas
- 🎯 **Lap Filtering** - Automatically hide incorrect laps
- 📋 **Lap Sorting** - Sort by name, distance, time, or speed
- 🏆 **Fastest Lap Detection** - Automatically highlight the fastest lap
- 📉 **Deltas** - Display time and speed differences relative to the fastest lap
- ⚙️ **Settings** - Configure filtering and debug information

## 🚀 Getting Started

### Install Dependencies

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

The application will open at [http://localhost:5174](http://localhost:5174)

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## 📝 How to Use

1. Click the **📂 Open File** button in the top toolbar
2. Select a `.vbo` file
3. The track will be displayed on the map with automatic lap detection
4. Use the right panel to control lap visibility
5. Use the charts panel at the bottom to compare laps
6. Hover over the track or charts to view detailed information
7. Click **⚙️** to open settings

## 🛠 Technologies

- **React 18** - UI library
- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast build tool
- **HTML5 Canvas** - High-performance rendering
- **Google Maps API** - Satellite imagery

## 📄 License

See [LICENSE](LICENSE) file for details.
