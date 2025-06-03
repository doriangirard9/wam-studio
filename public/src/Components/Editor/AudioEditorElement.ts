const template = document.createElement("template");

template.innerHTML = /*html*/`
<style id="style">
body {
  background: #111;
  color: #fff;
  font-family: sans-serif;
  text-align: center;
  padding: 2em;
}

canvas {
  background: transparent;
  border-radius: 8px;
}

.controls {
  margin: 20px auto;
}

.waveform-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 1000px;
  margin: 0 auto;
}

#overviewCanvas {
  margin-bottom: 15px;
  background: #222;
}

/* Main container */
.main-waveform-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  border-radius: 10px;
  padding: 15px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

/* Container for timeline and waveform */
.timeline-waveform-container {
  position: relative;
  width: 100%;
  height: 330px;
}

/* Timeline canvas styling */
#timelineCanvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: #1a1a1a;
  border-radius: 5px;
  z-index: 1;
}

/* Main waveform canvas styling */
#waveform {
  position: absolute;
  top: 30px; /* Leave space for timeline labels at top */
  left: 0;
  width: 100%;
  height: 300px;
  background: transparent; /* Transparent background to see the timeline */
  z-index: 2;
}

/* Scrollbar container */
#scrollbarContainer {
  width: 100%;
  margin-top: 10px;
  display: flex;
  justify-content: center;
}

#scrollBar {
  width: 100%;
  height: 10px;
  cursor: pointer;
  background: #555;
  border-radius: 5px;
}

/* Style for the zoom control */
.zoom-control {
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

#zoomSlider {
  width: 300px;
}

#zoomInput {
  width: 60px;
  background: #333;
  color: white;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 4px;
  text-align: center;
}

#zoomInput:focus {
  outline: none;
  border-color: #4CAF50;
}

#zoomValue {
  width: 40px;
  text-align: center;
}
</style>

<div>
  <h1>Waveform Interactive</h1>

  <input type="file" id="audioFile" accept="audio/*" />
  <div class="controls">
    <label for="precision">Densité d'échantillonnage :</label>
    <input type="range" id="precision" min="1" max="10000" value="10" />
    <span id="precisionValue">10</span><br />
    <label>De :
      <input type="number" id="startTime" value="0" step="0.1" /> sec</label>
    <label>à : <input type="number" id="endTime" value="0" step="0.1" /> sec</label>
    <button id="applyRange">Afficher</button>
  </div>

  <div class="waveform-container">
    <!-- Overview canvas on top -->
    <canvas id="overviewCanvas" width="1000" height="100"></canvas>
    
    <!-- Main waveform area with integrated timeline -->
    <div class="main-waveform-container">
      <!-- Combined waveform view with timeline -->
      <div class="timeline-waveform-container">
        <!-- Timeline canvas as background -->
        <canvas id="timelineCanvas" width="1000" height="330"></canvas>
        
        <!-- Waveform canvas overlaid -->
        <canvas id="waveform" width="1000" height="300"></canvas>
      </div>

      <!-- Horizontal scroll bar to pan -->
      <div id="scrollbarContainer">
        <input type="range" id="scrollBar" min="0" value="0" step="0.01" />
      </div>

      <div class="zoom-control">
        <label for="zoomSlider">Zoom:</label>
        <input type="range" id="zoomSlider" min="0.5" max="248" step="0.1" value="1">
        <span id="zoomValue">1x</span>
        <input type="number" id="zoomInput" min="0.5" max="248" step="0.1" value="1">
      </div>
    </div>
  </div>
</div>
`;

// Define constants for virtual canvas
const DEFAULT_VIRTUAL_DURATION = 600; // 10 minutes by default
const MIN_CANVAS_DURATION = 60; // Minimum 1 minute duration for visualization

// Define zoom milestones for waveform recalculation
// const ZOOM_MILESTONES = [0.5, 1, 2, 5, 10, 20, 50, 100, 200];
const ZOOM_MILESTONES = [0.1, 0.2, 0.5, 1, 2, 4, 6, 8, 10, 14, 18, 22, 28, 36, 48, 64, 80, 100];

export class AudioEditorElement extends HTMLElement {
  public shadow: ShadowRoot;

  private audioBuffer: AudioBuffer | null = null;

  private overviewCanvas!: HTMLCanvasElement;
  private overviewDrawer!: WaveformDrawer;
  
  // Reference to timeline canvas
  private timelineCanvas!: HTMLCanvasElement;

  private selectStart: number = 0;
  private selectEnd: number = 0;

  // Track visible portion in main waveform
  private visibleStart: number = 0;
  private visibleEnd: number = MIN_CANVAS_DURATION;
  
  // Current zoom level
  private currentZoom: number = 1;
  // Store the last calculated zoom level
  private lastCalculatedZoom: number = 1;
  // Store the waveform drawer instance for reuse with visual zoom
  private currentWaveformDrawer: WaveformDrawer | null = null;
  
  // Canvas virtual duration (not audio-dependent)
  private canvasDuration: number = DEFAULT_VIRTUAL_DURATION;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
  }

  public async connectedCallback() {
    this.shadow.appendChild(template.content.cloneNode(true));
    this.init();
  }

  /**
   * Find the nearest zoom milestone to use for calculation
   */
  private getNearestLowerMilestone(zoom: number): number {
    // Find the largest milestone that's less than or equal to the zoom
    for (let i = ZOOM_MILESTONES.length - 1; i >= 0; i--) {
      if (ZOOM_MILESTONES[i] <= zoom) {
        return ZOOM_MILESTONES[i];
      }
    }
    
    // Default to the lowest milestone if zoom is less than all milestones
    return ZOOM_MILESTONES[0];
  }

  public init() {
    const audioInput = this.shadow.getElementById("audioFile") as HTMLInputElement;
    const canvas = this.shadow.getElementById("waveform") as HTMLCanvasElement;
    this.overviewCanvas = this.shadow.getElementById("overviewCanvas") as HTMLCanvasElement;
    this.timelineCanvas = this.shadow.getElementById("timelineCanvas") as HTMLCanvasElement;

    const precisionInput = this.shadow.getElementById("precision") as HTMLInputElement;
    const precisionValue = this.shadow.getElementById("precisionValue") as HTMLElement;
    const startInput = this.shadow.getElementById("startTime") as HTMLInputElement;
    const endInput = this.shadow.getElementById("endTime") as HTMLInputElement;
    const applyButton = this.shadow.getElementById("applyRange") as HTMLButtonElement;

    const zoomSlider = this.shadow.getElementById("zoomSlider") as HTMLInputElement;
    const zoomValue = this.shadow.getElementById("zoomValue") as HTMLElement;
    const zoomInput = this.shadow.getElementById("zoomInput") as HTMLInputElement;
    
    // Get reference to the scroll bar
    const scrollBar = this.shadow.getElementById("scrollBar") as HTMLInputElement;

    this.overviewDrawer = new WaveformDrawer();
    
    // We'll hold onto a WaveformDrawer instance for reuse with visual zoom
    this.currentWaveformDrawer = null;

    let isSelecting: boolean = false;

    startInput.disabled = false;
    endInput.disabled = false;
    
    // Initialize empty canvas
    this.initializeEmptyCanvas(canvas);
    this.initializeEmptyOverview();
    
    const updateUI = (start: number, end: number) => {
      this.refreshView(start, end);
    };
    
    // Define a function to handle zoom changes from either slider or input
    const updateZoom = (zoom: number) => {
      // Clamp zoom to valid range
      zoom = Math.max(0.1, Math.min(248, zoom));
      
      // Store the current zoom level
      this.currentZoom = zoom;
      
      // Calculate visible duration based on current zoom
      const visibleDuration = this.canvasDuration / zoom;
      
      // Use the current visible area's center point for zooming
      const center = (this.visibleStart + this.visibleEnd) / 2;
      
      // Calculate new start and end times
      const start = Math.max(0, center - visibleDuration / 2);
      const end = Math.min(this.canvasDuration, center + visibleDuration / 2);
      
      // Update UI with new range
      updateUI(start, end);
    };
    
    // Initialize UI with default empty view
    // Set initial window to show first minute (not full canvas)
    updateUI(0, MIN_CANVAS_DURATION);
    
    // Initialize the scrollbar properly
    scrollBar.min = "0";
    scrollBar.max = (this.canvasDuration - MIN_CANVAS_DURATION).toFixed(2);
    scrollBar.value = "0";

    // The event listeners can now call refreshView directly
    audioInput.addEventListener("change", async (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;

      const arrayBuffer = await file.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      
      // Use our new method
      this.setAudioBuffer(decoded);
    });

    precisionInput.addEventListener("input", () => {
      precisionValue.textContent = precisionInput.value;
    });

    applyButton.addEventListener("click", () => {
      const precision = parseInt(precisionInput.value);
      
      let start: number;
      let end: number;
    
      const hasValidSelection = this.selectStart !== this.selectEnd;
    
      if (hasValidSelection) {
        // Use selection as waveform view range
        start = Math.min(this.selectStart, this.selectEnd);
        end = Math.max(this.selectStart, this.selectEnd);
    
        // Calculate the zoom factor based on selection size
        const selectionLength = end - start;
        this.currentZoom = this.canvasDuration / selectionLength;
    
        // Update zoom controls to reflect calculated zoom
        zoomSlider.value = this.currentZoom.toFixed(2);
        zoomInput.value = this.currentZoom.toFixed(1);
        zoomValue.textContent = `${this.currentZoom.toFixed(2)}x`;
        
        // Update UI with selection range
        updateUI(start, end);
      } else {
        // Fallback: show full canvas duration
        start = 0;
        end = this.canvasDuration;
        
        // Reset zoom 
        this.currentZoom = 1;
        zoomSlider.value = "1";
        zoomInput.value = "1";
        zoomValue.textContent = "1x";
        
        // Update UI with full range
        updateUI(start, end);
      }
    });
    
    let lastZoomDrawn = -1;

    zoomSlider.addEventListener("input", () => {
      const zoom = parseFloat(zoomSlider.value);
      
      // Update zoom input and label immediately for smooth UI feedback
      zoomInput.value = zoom.toFixed(1);
      zoomValue.textContent = `${zoom.toFixed(1)}x`;

      // Check if zoom is a multiple of 0.1 and not already drawn
      const isAtMultipleOfPointOne = Math.abs(zoom * 10 - Math.round(zoom * 10)) < 0.05;

      if (isAtMultipleOfPointOne && Math.abs(zoom - lastZoomDrawn) >= 0.1) {
        lastZoomDrawn = zoom;
        updateZoom(zoom);
      }
    });
    
    // Trigger a visual update without recalculating peaks when the zoom slider is released
    zoomSlider.addEventListener("change", () => {
      const zoom = parseFloat(zoomSlider.value);
      updateZoom(zoom);
    });
    
    // Handle manual zoom input
    zoomInput.addEventListener("change", () => {
      const zoom = parseFloat(zoomInput.value);
      if (!isNaN(zoom) && zoom >= 0.1 && zoom <= 248) {
        updateZoom(zoom);
      } else {
        // Reset to valid value if input is invalid
        zoomInput.value = this.currentZoom.toFixed(1);
      }
    });
    
    // Handle pressing Enter in the zoom input
    zoomInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        const zoom = parseFloat(zoomInput.value);
        if (!isNaN(zoom) && zoom >= 0.1 && zoom <= 248) {
          updateZoom(zoom);
        } else {
          // Reset to valid value if input is invalid
          zoomInput.value = this.currentZoom.toFixed(1);
        }
      }
    });
    
    // Add event listener for the scroll bar
    scrollBar.addEventListener("input", () => {
      const scrollPosition = parseFloat(scrollBar.value);
      
      // Calculate visible duration based on current visible area
      const visibleDuration = this.visibleEnd - this.visibleStart;
      
      // Calculate new start and end based on scroll position
      const newStart = scrollPosition;
      const newEnd = Math.min(this.canvasDuration, newStart + visibleDuration);
      
      // Also update the selection points to match the visible area
      this.selectStart = newStart;
      this.selectEnd = newEnd;
      
      // Update UI with new range
      updateUI(newStart, newEnd);
    });

    this.overviewCanvas.addEventListener("mousedown", (e: MouseEvent) => {
      isSelecting = true;
      const rect = this.overviewCanvas.getBoundingClientRect();
      this.selectStart =
        ((e.clientX - rect.left) / this.overviewCanvas.width) * this.canvasDuration;
    });

    this.overviewCanvas.addEventListener("mousemove", (e: MouseEvent) => {
      if (!isSelecting) return;
      
      const rect = this.overviewCanvas.getBoundingClientRect();
      this.selectEnd =
        ((e.clientX - rect.left) / this.overviewCanvas.width) * this.canvasDuration;
        
      this.highlightSelection();
    });

    this.overviewCanvas.addEventListener("mouseup", () => {
      if (!isSelecting) return;
      isSelecting = false;
      const start = Math.min(this.selectStart, this.selectEnd);
      const end = Math.max(this.selectStart, this.selectEnd);
      startInput.value = start.toFixed(2);
      endInput.value = end.toFixed(2);
    });
  }
  
  /**
   * Initialize an empty canvas with time markers
   */
  private initializeEmptyCanvas(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw a horizontal line in the center
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.strokeStyle = "#333";
    ctx.stroke();
  }
  
  /**
   * Initialize empty overview with time markings
   */
  private initializeEmptyOverview(): void {
    const ctx = this.overviewCanvas.getContext('2d');
    if (!ctx) return;
    
    // Clear the canvas
    ctx.clearRect(0, 0, this.overviewCanvas.width, this.overviewCanvas.height);
    
    // Draw a horizontal line in the center
    ctx.beginPath();
    ctx.moveTo(0, this.overviewCanvas.height / 2);
    ctx.lineTo(this.overviewCanvas.width, this.overviewCanvas.height / 2);
    ctx.strokeStyle = "#444";
    ctx.stroke();
    
    // Add time markings
    ctx.font = "10px Arial";
    ctx.fillStyle = "#666";
    ctx.textAlign = "center";
    
    const minuteMarkers = Math.min(10, this.canvasDuration / 60);
    
    for (let i = 0; i <= minuteMarkers; i++) {
      const x = (i / minuteMarkers) * this.overviewCanvas.width;
      const seconds = (i / minuteMarkers) * this.canvasDuration;
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.floor(seconds % 60);
      
      // Draw tick mark
      ctx.beginPath();
      ctx.moveTo(x, this.overviewCanvas.height * 0.4);
      ctx.lineTo(x, this.overviewCanvas.height * 0.6);
      ctx.strokeStyle = "#555";
      ctx.stroke();
      
      // Add time label
      ctx.fillText(
        `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`, 
        x, 
        this.overviewCanvas.height * 0.25
      );
    }
  }
  
  /**
   * Mark the audio boundary in the overview
   */
  private markAudioBoundary(): void {
    if (!this.audioBuffer) return;
    
    const ctx = this.overviewCanvas.getContext('2d');
    if (!ctx) return;
    
    // Calculate where audio ends
    const audioEndX = (this.audioBuffer.duration / this.canvasDuration) * this.overviewCanvas.width;
    
    // Draw audio boundary marker
    ctx.beginPath();
    ctx.moveTo(audioEndX, 0);
    ctx.lineTo(audioEndX, this.overviewCanvas.height);
    ctx.strokeStyle = "rgba(255, 80, 80, 0.7)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;
    
    // Add audio boundary label
    ctx.font = "10px Arial";
    ctx.fillStyle = "rgba(255, 150, 150, 0.9)";
    ctx.textAlign = "left";
    ctx.fillText("End", audioEndX + 4, 10);
  }

  /**
   * Draws a timeline behind the waveform showing time markers with vertical grid lines
   * @param start Start time in seconds
   * @param end End time in seconds
   */
  private drawTimeline(start: number, end: number): void {
    if (!this.timelineCanvas) return;
    
    const ctx = this.timelineCanvas.getContext("2d");
    if (!ctx) return;
    
    const width = this.timelineCanvas.width;
    const height = this.timelineCanvas.height;
    
    // Clear the canvas
    ctx.clearRect(0, 0, width, height);
    
    // Set text properties
    ctx.font = "10px Arial";
    ctx.fillStyle = "#aaa";
    ctx.textAlign = "center";
    
    const duration = end - start;
    
    // Determine appropriate time interval based on zoom level
    let interval: number;
    let minorTickCount: number = 5; // Default number of minor ticks between major ticks
    
    if (duration <= 0.5) {
      interval = 0.1; // 100ms intervals
      minorTickCount = 10; // 10ms minor ticks
    } else if (duration <= 1) {
      interval = 0.2; // 200ms intervals
      minorTickCount = 4; // 50ms minor ticks
    } else if (duration <= 3) {
      interval = 0.5; // 500ms intervals
      minorTickCount = 5; // 100ms minor ticks
    } else if (duration <= 10) {
      interval = 1; // 1 second intervals
      minorTickCount = 5; // 200ms minor ticks
    } else if (duration <= 30) {
      interval = 5; // 5 second intervals
      minorTickCount = 5; // 1 second minor ticks
    } else if (duration <= 60) {
      interval = 10; // 10 second intervals
      minorTickCount = 10; // 1 second minor ticks
    } else if (duration <= 300) {
      interval = 30; // 30 second intervals
      minorTickCount = 6; // 5 second minor ticks
    } else {
      interval = 60; // 1 minute intervals
      minorTickCount = 6; // 10 second minor ticks
    }
    
    // Calculate minor interval based on the major interval and desired tick count
    const minorInterval = interval / minorTickCount;
    
    // Find the first tick position (round start to nearest minor interval for completeness)
    const firstMinorTick = Math.ceil(start / minorInterval) * minorInterval;
    
    // Draw all ticks (both minor and major)
    for (let time = firstMinorTick; time < end; time += minorInterval) {
      // Calculate the x position for this timestamp
      const x = ((time - start) / duration) * width;
      
      // Check if this is a major tick (divisible by the interval)
      const isMajorTick = Math.abs(time % interval) < 0.0001;
      
      // Determine if this time position has audio content (if audio is loaded)
      const hasAudioContent = this.audioBuffer && time < this.audioBuffer.duration && time >= 0;
      
      if (isMajorTick) {
        // Draw full-height vertical grid line for major tick
        ctx.beginPath();
        ctx.moveTo(x, 20); // Start below the labels
        ctx.lineTo(x, height);
        ctx.strokeStyle = "rgba(136, 136, 136, 0.3)"; // Semi-transparent grid lines
        ctx.stroke();
        
        // Draw major tick mark at the top
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 16);
        ctx.strokeStyle = "#888";
        ctx.stroke();
        
        // Format time for display
        let formattedTime: string;
        if (time < 60) {
          // For times less than 1 minute, show seconds
          formattedTime = time.toFixed(1) + "s";
        } else {
          // For times >= 1 minute, show minutes:seconds
          const minutes = Math.floor(time / 60);
          const seconds = time % 60;
          formattedTime = `${minutes}:${seconds.toFixed(0).padStart(2, '0')}`;
        }
        
        // Draw timestamp
        ctx.fillText(formattedTime, x, 14);
      } else {
        // Draw minor tick mark
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 10);
        ctx.strokeStyle = "#444";
        ctx.stroke();
        
        // Draw faint vertical grid line for minor tick
        ctx.beginPath();
        ctx.moveTo(x, 20); // Start below the labels
        ctx.lineTo(x, height);
        ctx.strokeStyle = "rgba(68, 68, 68, 0.2)"; // Very faint minor grid lines
        ctx.stroke();
      }
    }
    
    // Draw horizontal divider line
    ctx.beginPath();
    ctx.moveTo(0, 20);
    ctx.lineTo(width, 20);
    ctx.strokeStyle = "#666";
    ctx.stroke();
    
    // If audio is loaded, mark audio boundaries if visible in current view
    if (this.audioBuffer) {
      const audioStart = 0; // Audio always starts at time 0
      const audioEnd = this.audioBuffer.duration;
      
      // Check if audio start is visible in current view
      if (audioStart >= start && audioStart <= end) {
        const audioStartX = ((audioStart - start) / duration) * width;
        this.drawAudioBoundaryMarker(ctx, audioStartX, height, "Start");
      }
      
      // Check if audio end is visible in current view
      if (audioEnd >= start && audioEnd <= end) {
        const audioEndX = ((audioEnd - start) / duration) * width;
        this.drawAudioBoundaryMarker(ctx, audioEndX, height, "End");
      }
    }
  }
  
  /**
   * Draw a marker for audio boundaries in the timeline
   */
  private drawAudioBoundaryMarker(ctx: CanvasRenderingContext2D, x: number, height: number, label: string): void {
    // Draw vertical line
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.strokeStyle = "rgba(255, 80, 80, 0.7)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;
    
    // Add label
    ctx.font = "10px Arial";
    ctx.fillStyle = "#f88";
    ctx.textAlign = "center";
    ctx.fillText(`Audio ${label}`, x, height - 5);
  }

  // Highlights user selection on overview canvas
  public highlightSelection(): void {
    // Redraw overview to clear previous selection
    if (this.audioBuffer) {
      this.initializeEmptyOverview();
      
      // Initialize the overview drawer
      const precision = 10; // Use a default precision for overview
      this.overviewDrawer.init(this.audioBuffer, this.overviewCanvas, precision);
      
      // Calculate the width for the audio portion based on its duration relative to canvas duration
      const audioWidth = (this.audioBuffer.duration / this.canvasDuration) * this.overviewCanvas.width;
      
      // Draw only the audio portion within the overview
      this.overviewDrawer.drawWave(0, audioWidth);
      
      this.markAudioBoundary();
    } else {
      this.initializeEmptyOverview();
    }
    
    const ctx = this.overviewCanvas.getContext("2d");
    if (!ctx) return;

    const startX =
      (Math.min(this.selectStart, this.selectEnd) / this.canvasDuration) *
      this.overviewCanvas.width;
    const width =
      (Math.abs(this.selectEnd - this.selectStart) / this.canvasDuration) *
      this.overviewCanvas.width;

    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillRect(startX, 0, width, this.overviewCanvas.height);
  }

  // Highlights the currently visible area on overview canvas
  public highlightVisibleArea(): void {
    // First redraw the overview to clear any previous highlighting
    if (this.audioBuffer) {
      this.initializeEmptyOverview();
      
      // Initialize the overview drawer
      const precision = 10; // Use a default precision for overview
      this.overviewDrawer.init(this.audioBuffer, this.overviewCanvas, precision);
      
      // Calculate the width for the audio portion based on its duration relative to canvas duration
      const audioWidth = (this.audioBuffer.duration / this.canvasDuration) * this.overviewCanvas.width;
      
      // Draw only the audio portion within the overview
      this.overviewDrawer.drawWave(0, audioWidth);
      
      this.markAudioBoundary();
    } else {
      this.initializeEmptyOverview();
    }
    
    const ctx = this.overviewCanvas.getContext("2d");
    if (!ctx) return;
    
    // Convert time positions to x coordinates
    const startX = (this.visibleStart / this.canvasDuration) * this.overviewCanvas.width;
    const endX = (this.visibleEnd / this.canvasDuration) * this.overviewCanvas.width;
    const width = endX - startX;
    
    // Draw semi-transparent highlight for visible area
    ctx.fillStyle = "rgba(0, 150, 255, 0.3)";
    ctx.fillRect(startX, 0, width, this.overviewCanvas.height);
    
    // Draw borders to make the visible area more obvious
    ctx.strokeStyle = "rgba(0, 150, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    // Vertical lines at start and end
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, this.overviewCanvas.height);
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX, this.overviewCanvas.height);
    
    ctx.stroke();
    
    // Add draggable handles on the highlighted area
    this.drawDragHandles(ctx, startX, endX);
  }
  
  // Draw drag handles on the visible area
  private drawDragHandles(ctx: CanvasRenderingContext2D, startX: number, endX: number): void {
    const handleSize = 8;
    const halfHandle = handleSize / 2;
    const centerY = this.overviewCanvas.height / 2;
    
    // Draw center handle for easier grabbing
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.strokeStyle = "rgba(0, 150, 255, 1)";
    ctx.lineWidth = 1;
    
    // Middle handle
    const middleX = startX + (endX - startX) / 2;
    ctx.beginPath();
    ctx.rect(middleX - halfHandle, centerY - halfHandle, handleSize, handleSize);
    ctx.fill();
    ctx.stroke();
  }

  /**
   * Display the current zoom level indicator
   */
  private displayZoomLevelInfo(zoomDisplay: HTMLElement, calculatedZoom: number, visualZoom: number): void {
    if (calculatedZoom === visualZoom) {
      // If at a milestone, display just the zoom
      zoomDisplay.textContent = `${visualZoom.toFixed(1)}x`;
    } else {
      // Otherwise show that we're using a pre-calculated value visually scaled
      zoomDisplay.textContent = `${visualZoom.toFixed(1)}x (based on ${calculatedZoom.toFixed(1)}x)`;
    }
  }

  // Add a new method to set the audio buffer directly
  public setAudioBuffer(buffer: AudioBuffer): void {
    this.audioBuffer = buffer;
    
    // Get the precision value from the UI
    const precisionInput = this.shadow.getElementById("precision") as HTMLInputElement;
    const precision = parseInt(precisionInput.value);

    // Initialize overview to show full canvas duration with audio 
    this.initializeEmptyOverview();
    
    // Draw the audio portion in the overview
    this.overviewDrawer.init(buffer, this.overviewCanvas, precision);
    this.overviewDrawer.drawWave(0, (buffer.duration / this.canvasDuration) * this.overviewCanvas.width);
    
    // Mark the audio boundary in the overview
    this.markAudioBoundary();
    
    // Reset waveform drawer to ensure recalculation with new audio
    this.currentWaveformDrawer = null;
    this.lastCalculatedZoom = 1;
    
    // Keep the current visible range but refresh the view to show audio if applicable
    // We need to access updateUI from here, so we'll need to refactor a bit
    this.refreshView(this.visibleStart, this.visibleEnd);
  }

  // Refactor updateUI to be a class method so we can call it from setAudioBuffer
  private refreshView(start: number, end: number): void {
    const canvas = this.shadow.getElementById("waveform") as HTMLCanvasElement;
    const precisionInput = this.shadow.getElementById("precision") as HTMLInputElement;
    const startInput = this.shadow.getElementById("startTime") as HTMLInputElement;
    const endInput = this.shadow.getElementById("endTime") as HTMLInputElement;
    const zoomSlider = this.shadow.getElementById("zoomSlider") as HTMLInputElement;
    const zoomValue = this.shadow.getElementById("zoomValue") as HTMLElement;
    const zoomInput = this.shadow.getElementById("zoomInput") as HTMLInputElement;
    const scrollBar = this.shadow.getElementById("scrollBar") as HTMLInputElement;
    
    const precision = parseInt(precisionInput.value);
    
    // Clear the main waveform canvas
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw audio waveform if available and overlapping with visible range
    if (this.audioBuffer) {
      const audioDuration = this.audioBuffer.duration;
      const audioStart = 0; // Audio always starts at time 0
      const audioEnd = audioDuration;
      
      // Check if there's overlap between visible range and audio content
      if (start < audioEnd && end > audioStart) {
        // Calculate the portion of audio that should be visible
        const visibleAudioStart = Math.max(start, audioStart);
        const visibleAudioEnd = Math.min(end, audioEnd);
        
        // Determine if we need to recalculate the peaks based on zoom milestone
        const calculatedZoomLevel = this.getNearestLowerMilestone(this.currentZoom);
        
        // Determine if we need to recalculate the waveform
        const needsRecalculation = 
          !this.currentWaveformDrawer || // First render
          calculatedZoomLevel !== this.lastCalculatedZoom || // Zoom milestone changed
          visibleAudioStart !== this.visibleStart || // Visible range changed
          visibleAudioEnd !== this.visibleEnd; // Visible range changed
          
        if (needsRecalculation) {
          // Store that we've calculated for this zoom level
          this.lastCalculatedZoom = calculatedZoomLevel;
          
          // Create a new drawer for this zoom level
          this.currentWaveformDrawer = new WaveformDrawer();
          
          // Initialize waveform drawer with the overlapping section and the calculated zoom level
          this.currentWaveformDrawer.init(
            this.audioBuffer, 
            canvas, 
            precision, 
            visibleAudioStart, 
            visibleAudioEnd,
            calculatedZoomLevel
          );
          
          // Add info to status display about calculation
          console.log(`Recalculated waveform at zoom level: ${calculatedZoomLevel}x`);
        }
        
        // Adjust position to account for canvas coordinates
        // Calculate what percentage of the view should be occupied by the audio
        const startOffset = (visibleAudioStart - start) / (end - start) * canvas.width;
        const visibleWidth = (visibleAudioEnd - visibleAudioStart) / (end - start) * canvas.width;
        
        // Draw the wave at the correct position with the correct width, passing visual zoom factor
        if (this.currentWaveformDrawer) {
          this.currentWaveformDrawer.drawWave(startOffset, visibleWidth, this.currentZoom);
          
          // Update display to indicate if we're using a calculated or visual zoom
          this.displayZoomLevelInfo(zoomValue, this.lastCalculatedZoom, this.currentZoom);
        }
      }
    }
    
    // Update timeline
    this.drawTimeline(start, end);
    
    // Update the visible area highlight in overview
    this.highlightVisibleArea();
    
    // Update time inputs
    startInput.value = start.toFixed(2);
    endInput.value = end.toFixed(2);
    
    // Update visible range tracking
    this.visibleStart = start;
    this.visibleEnd = end;
    
    // Update zoom input to reflect current zoom
    zoomInput.value = this.currentZoom.toFixed(1);
    
    // Always update scrollbar range based on visible duration
    const visibleDuration = end - start;
    const maxScroll = this.canvasDuration - visibleDuration;
    
    // Enable scrolling even at zoom=1 if we're not viewing the entire canvas
    scrollBar.min = "0";
    scrollBar.max = maxScroll > 0 ? maxScroll.toFixed(2) : "0";
    scrollBar.value = start.toFixed(2);
    scrollBar.disabled = maxScroll <= 0;
  }
}

customElements.define("audio-editor-element", AudioEditorElement)

export class WaveformDrawer {
  private decodedAudioBuffer: AudioBuffer | null = null;
  private peaks: Float32Array | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private sampleStep: number = 10;
  // Track the actual zoom level used for peak calculation
  private calculatedZoomLevel: number = 1; 

  init(
    decodedAudioBuffer: AudioBuffer,
    canvas: HTMLCanvasElement,
    sampleStep: number = 10,
    startSec: number = 0,
    endSec: number | null = null,
    zoomLevel: number = 1
  ): void {
    this.decodedAudioBuffer = decodedAudioBuffer;
    this.canvas = canvas;
    this.sampleStep = sampleStep;
    // Store the zoom level we're calculating for
    this.calculatedZoomLevel = zoomLevel;
    this.getPeaks(startSec, endSec);
  }

  // Add getter for calculatedZoomLevel
  getCalculatedZoomLevel(): number {
    return this.calculatedZoomLevel;
  }

  private getPeaks(startSec: number = 0, endSec: number | null = null): void {
    if (!this.decodedAudioBuffer || !this.canvas) return;

    const buffer = this.decodedAudioBuffer;
    const sampleRate = buffer.sampleRate;
    const startSample = Math.floor(startSec * sampleRate);
    const endSample = endSec ? Math.floor(endSec * sampleRate) : buffer.length;
    const width = this.canvas.width;
    const sampleSize = Math.ceil((endSample - startSample) / width);

    this.peaks = new Float32Array(width);

    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const channel = buffer.getChannelData(c);
      for (let i = 0; i < width; i++) {
        const start = startSample + i * sampleSize;
        const end = Math.min(start + sampleSize, endSample);
        let peak = 0;
        for (let j = start; j < end; j += this.sampleStep) {
          const value = channel[j];
          const abs = Math.abs(value);
          if (abs > peak) peak = abs;
        }
        if (c === 0) {
          this.peaks[i] = peak;
        } else {
          this.peaks[i] = (this.peaks[i] + peak) / 2;
        }
      }
    }
  }

  // Modified drawWave method to handle visual scaling
  drawWave(startX: number = 0, width: number = 0, visualZoom: number = 1): void {
    if (!this.canvas || !this.peaks) return;

    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;

    const canvasWidth = this.canvas.width;
    const height = this.canvas.height;
    const halfH = height / 2;
    const coef = halfH;

    // Clear the entire canvas if no specific width is provided
    if (width <= 0) {
      ctx.clearRect(0, 0, canvasWidth, height);
      width = canvasWidth;
    }

    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, "#00ffff");
    grad.addColorStop(0.5, "#4CAF50");
    grad.addColorStop(1, "#ff00ff");

    ctx.fillStyle = grad;
    ctx.beginPath();
    
    // Use the provided width or default to full canvas width
    const drawWidth = width > 0 ? Math.min(width, canvasWidth - startX) : canvasWidth;
    
    // Start at the specified X position
    ctx.moveTo(startX, halfH);
    
    // Calculate zoom ratio for visual scaling (relationship between visual zoom and calculated zoom)
    const zoomRatio = visualZoom / this.calculatedZoomLevel;
    
    // The effective width we're rendering from our peaks array
    const effectivePeaksWidth = drawWidth / zoomRatio;
    
    // The starting point in the peaks array (centered if zooming in)
    const peaksOffset = (this.peaks.length - effectivePeaksWidth) / 2;
    
    // Draw top curve with zoom scaling
    for (let i = 0; i < drawWidth; i++) {
      // Calculate source position in peaks array considering zoom
      const sourcePos = i / zoomRatio;
      const peakIndex = Math.floor(peaksOffset + sourcePos);
      
      // Ensure peak index is within bounds
      if (peakIndex >= 0 && peakIndex < this.peaks.length) {
        const val = this.peaks[peakIndex] * coef;
        ctx.lineTo(startX + i, halfH - val);
      } else {
        // Use center line if out of bounds
        ctx.lineTo(startX + i, halfH);
      }
    }
    
    // Draw bottom curve (in reverse) with zoom scaling
    for (let i = drawWidth - 1; i >= 0; i--) {
      // Calculate source position in peaks array considering zoom
      const sourcePos = i / zoomRatio;
      const peakIndex = Math.floor(peaksOffset + sourcePos);
      
      // Ensure peak index is within bounds
      if (peakIndex >= 0 && peakIndex < this.peaks.length) {
        const val = this.peaks[peakIndex] * coef;
        ctx.lineTo(startX + i, halfH + val);
      } else {
        // Use center line if out of bounds
        ctx.lineTo(startX + i, halfH);
      }
    }
    
    ctx.closePath();
    ctx.globalAlpha = 0.4;
    ctx.fill();

    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    // Draw vertical lines with zoom scaling
    for (let i = 0; i < drawWidth; i++) {
      // Only draw every other line at higher zoom for better performance
      if (visualZoom > 5 && i % 2 !== 0) continue;
      
      // Calculate source position in peaks array considering zoom
      const sourcePos = i / zoomRatio;
      const peakIndex = Math.floor(peaksOffset + sourcePos);
      
      // Ensure peak index is within bounds
      if (peakIndex >= 0 && peakIndex < this.peaks.length) {
        const val = this.peaks[peakIndex] * coef;
        ctx.moveTo(startX + i, halfH - val);
        ctx.lineTo(startX + i, halfH + val);
      }
    }
    
    ctx.stroke();
  }
}
