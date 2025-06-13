const template = document.createElement("template");

template.innerHTML = /*html*/`
<style id="style">
/* Main container */
.main-waveform-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100%;
  min-height: 400px; /* Increase minimum height to 400px */
  background-color: rgba(0, 0, 0, 0.5);
  padding: 5px;
  box-sizing: border-box;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
}

/* Container for timeline and waveform */
.timeline-waveform-container {
  position: relative;
  width: 100%;
  height: calc(100% - 80px); /* Allocate more space for the waveform, leave 80px for controls */
  min-height: 320px; /* Ensure minimum height for the waveform container */
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
  height: calc(100% - 30px);
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
  height: 15px; /* Make scrollbar a bit taller */
  cursor: pointer;
  background: #555;
  border-radius: 5px;
}

/* Style for the zoom control */
.zoom-control {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 40px; /* Set explicit height for the zoom control */
}

#zoomSlider {
  width: 300px;
  height: 20px;
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

/* Playhead styling */
.playhead {
  position: absolute;
  top: 0;
  height: 100%;
  width: 1px;
  background-color: rgba(200, 200, 200, 0.7);
  pointer-events: auto;
  z-index: 3;
  transition: left 0.05s linear;
}

.playhead::before {
  content: "";
  position: absolute;
  top: 0;
  left: -4px;
  width: 9px;
  height: 9px;
  background-color: white;
  clip-path: polygon(50% 100%, 0% 0%, 100% 0%);
}

.close-button-container {
  position: relative;
  width: 100%;
}

.close-button {
  position: absolute;
  width: 30px;
  height: 30px;
  top: 5px;
  right: 5px;
  background-color: rgba(255, 0, 0, 0.7);
  border-radius: 10%;
  color: white;
  border: none;
  font-size: 20px;
  cursor: pointer;
  padding: 5px;
  z-index: 4;
}

.time-selection {
  position: absolute;
  background-color: rgba(100, 149, 237, 0.3);
  border: 1px solid rgba(100, 149, 237, 0.7);
  pointer-events: none;
  z-index: 3;
}

</style>

<div class="main-waveform-container">
  <div class="close-button-container">
    <button class="close-button">X</button>
  </div>

  <!-- Combined waveform view with timeline -->
  <div class="timeline-waveform-container">
    <!-- Timeline canvas as background -->
    <canvas id="timelineCanvas"></canvas>
    
    <!-- Waveform canvas overlaid -->
    <canvas id="waveform"></canvas>

    <!-- Playhead element -->
    <div class="playhead" id="audioEditorPlayhead"></div>
 
  </div>

  <!-- Horizontal scroll bar to pan -->
  <div id="scrollbarContainer">
    <input type="range" id="scrollBar" min="0" value="0" step="0.01" />
  </div>

  <div class="zoom-control">
    <label for="zoomSlider">Zoom:</label>
    <input type="range" id="zoomSlider" min="0.5" max="100" step="0.1" value="1">
    <span id="zoomValue">1x</span>
    <input type="number" id="zoomInput" min="0.5" max="100" step="0.1" value="1">
  </div>

  <button class="normalize-button">Normalize</button>
</div>
`;

// Canvas constants
// by default we create a 10 minute visualisation time range
const DEFAULT_VIRTUAL_DURATION = 600;
const MIN_CANVAS_DURATION = 60;

// Precision is the sampleStep
const DEFAULT_PRECISION = 100;

// Zoom milestones, we will only recalculate waveform when at these values
// Between milestones we will just use visual zoom
const ZOOM_MILESTONES = [0.1, 0.2, 0.5, 1, 2, 4, 6, 8, 10, 14, 18, 22, 28, 36, 42, 48, 54, 60, 66, 72, 78, 84, 90, 96, 100];

export class AudioEditorElement extends HTMLElement {
  public shadow: ShadowRoot;

  private audioBuffer: AudioBuffer | null = null;
  private audioStartTime: number = 0;

  private startTimeSelection: number = -1;
  private endTimeSelection: number = -1;
  private isSelecting: boolean = false;
  private selectionStartX: number = 0;
  private selectionEndX: number = 0;
  private selectionElement: HTMLElement | null = null;
  
  // Reference to timeline canvas
  private timelineCanvas!: HTMLCanvasElement;
  private waveformCanvas!: HTMLCanvasElement;

  // Track visible portion in main waveform
  // Used to draw/calculate only the visible part of the waveform
  private visibleStart: number = 0;
  private visibleEnd: number = MIN_CANVAS_DURATION;
  
  // Zoom related
  private currentZoom: number = 1;
  private lastCalculatedZoom: number = 1;

  private currentWaveformDrawer: WaveformDrawer | null = null;
  
  // Canvas virtual duration
  private canvasDuration: number = DEFAULT_VIRTUAL_DURATION;
  
  // Observer for resizing
  private resizeObserver: ResizeObserver;

  // Playhead related
  private playheadElement!: HTMLElement;
  private playheadPosition: number = 0;

  // Do we use page-based scrolling triggered by playhead, or dynamic scrolling
  private readonly usePageBasedScrolling: boolean = true;
  
  private isDraggingPlayhead: boolean = false;


  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
    
    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
  }

  public async connectedCallback() {
    this.shadow.appendChild(template.content.cloneNode(true));
    
    requestAnimationFrame(() => {
      const container = this.shadow.querySelector('.timeline-waveform-container');
      if (container) {
        this.resizeObserver.observe(container);
      } else {
        console.error('Could not find timeline-waveform-container element');
      }
    });
  }
  
  public disconnectedCallback() {
    // Clean up resize observer
    this.resizeObserver.disconnect();
  }

  /**
   * Handle resizing of the container
   */
  private handleResize() {
    const container = this.shadow.querySelector('.timeline-waveform-container');
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    
    if (this.timelineCanvas) {
      this.timelineCanvas.width = rect.width;
      this.timelineCanvas.height = rect.height;
    }
    
    if (this.waveformCanvas) {
      this.waveformCanvas.width = rect.width;
      this.waveformCanvas.height = rect.height - 30; // offset for timeline header
    }
    
    // Refresh the view with new dimensions
    this.refreshView(this.visibleStart, this.visibleEnd);
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
    this.waveformCanvas = this.shadow.getElementById("waveform") as HTMLCanvasElement;
    this.timelineCanvas = this.shadow.getElementById("timelineCanvas") as HTMLCanvasElement;
    this.initPlayhead();
    this.initSelection();

    const zoomSlider = this.shadow.getElementById("zoomSlider") as HTMLInputElement;
    const zoomValue = this.shadow.getElementById("zoomValue") as HTMLElement;
    const zoomInput = this.shadow.getElementById("zoomInput") as HTMLInputElement;

    const closeButton = this.shadow.querySelector('.close-button') as HTMLButtonElement;
    closeButton.addEventListener('click', () => {
      this.onCloseButtonClick();
    });
    const normalizeButton = this.shadow.querySelector('.normalize-button') as HTMLButtonElement;
    normalizeButton.addEventListener('click', () => {
      this.onNormalizeButtonClick();
    });
    
    const scrollBar = this.shadow.getElementById("scrollBar") as HTMLInputElement;
    this.setupWheelZoom();

    this.currentWaveformDrawer = null;

    this.handleResize();
    
    this.initializeEmptyCanvas();
    
    const updateUI = (start: number, end: number) => {
      this.refreshView(start, end);
    };
    
    const updateZoom = (zoom: number) => {
      zoom = Math.max(0.5, Math.min(100, zoom));
      
      this.currentZoom = zoom;
      const visibleDuration = this.canvasDuration / zoom;
      
      let zoomCenterSecs = this.playheadPosition;
      
      if (!this.isPlayheadInVisibleRange(this.playheadPosition * 1000)) {
        zoomCenterSecs = (this.visibleStart + this.visibleEnd) / 2;
      }
      
      const start = Math.max(0, zoomCenterSecs - visibleDuration / 2);
      const end = Math.min(this.canvasDuration, start + visibleDuration);
      
      updateUI(start, end);
    };

    
    scrollBar.min = "0";
    scrollBar.max = (this.canvasDuration - MIN_CANVAS_DURATION).toFixed(2);
    scrollBar.value = "0";

    let lastZoomDrawn = -1;

    zoomSlider.addEventListener("input", () => {
      const zoom = parseFloat(zoomSlider.value);
      
      zoomInput.value = zoom.toFixed(1);
      zoomValue.textContent = `${zoom.toFixed(1)}x`;

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
      if (!isNaN(zoom) && zoom >= 0.5 && zoom <= 100) {
        updateZoom(zoom);
      } else {
        zoomInput.value = this.currentZoom.toFixed(1);
      }
    });
    
    // Possibility to set zoom via text input
    zoomInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        const zoom = parseFloat(zoomInput.value);
        if (!isNaN(zoom) && zoom >= 0.5 && zoom <= 100) {
          updateZoom(zoom);
        } else {
          zoomInput.value = this.currentZoom.toFixed(1);
        }
      }
    });
    
    // Scrollbar related
    scrollBar.addEventListener("input", () => {
      const scrollPosition = parseFloat(scrollBar.value);
      
      const visibleDuration = this.visibleEnd - this.visibleStart;
      
      const newStart = scrollPosition;
      const newEnd = Math.min(this.canvasDuration, newStart + visibleDuration);
      
      // We update the UI with the new visible range
      updateUI(newStart, newEnd);
    });
  }

  /**
   * Initialize selection functionality
   */
  private initSelection(): void {
    this.selectionElement = document.createElement('div');
    this.selectionElement.className = 'time-selection';
    this.selectionElement.style.position = 'absolute';
    this.selectionElement.style.backgroundColor = 'rgba(100, 149, 237, 0.3)';
    this.selectionElement.style.border = '1px solid rgba(100, 149, 237, 0.7)';
    this.selectionElement.style.pointerEvents = 'none';
    this.selectionElement.style.display = 'none';
    this.selectionElement.style.zIndex = '3';
    this.selectionElement.style.top = '30px';
    this.selectionElement.style.height = 'calc(100% - 30px)';
    
    const container = this.shadow.querySelector('.timeline-waveform-container');
    if (container) {
      container.appendChild(this.selectionElement);
    }
    
    // Add mouse event listeners for selection
    this.waveformCanvas.addEventListener('mousedown', (e) => {
      if (!this.isDraggingPlayhead && !e.shiftKey) {
        const rect = this.waveformCanvas.getBoundingClientRect();
        this.selectionStartX = e.clientX - rect.left;
        this.selectionEndX = this.selectionStartX;
        
        // Calculate start time based on position
        const positionRatio = this.selectionStartX / this.waveformCanvas.width;
        this.startTimeSelection = this.visibleStart + positionRatio * (this.visibleEnd - this.visibleStart);
        this.endTimeSelection = this.startTimeSelection;
        
        this.isSelecting = true;
        this.updateSelectionDisplay();
        
        e.preventDefault();
      }
    });
    
    document.addEventListener('mousemove', (e) => {
      if (this.isSelecting) {
        const rect = this.waveformCanvas.getBoundingClientRect();
        this.selectionEndX = Math.max(0, Math.min(e.clientX - rect.left, this.waveformCanvas.width));
        
        // Calculate end time based on position
        const positionRatio = this.selectionEndX / this.waveformCanvas.width;
        this.endTimeSelection = this.visibleStart + positionRatio * (this.visibleEnd - this.visibleStart);
        
        this.updateSelectionDisplay();
      }
    });
    
    document.addEventListener('mouseup', () => {
      if (this.isSelecting) {
        this.isSelecting = false;
        
        // Ensure start time is before end time
        if (this.startTimeSelection > this.endTimeSelection) {
          [this.startTimeSelection, this.endTimeSelection] = [this.endTimeSelection, this.startTimeSelection];
        }

        this.startTimeSelection = Math.max(0, this.startTimeSelection - this.audioStartTime);
        this.endTimeSelection = Math.max(0, this.endTimeSelection - this.audioStartTime);
        
        // If selection is too small we clear it
        if (Math.abs(this.endTimeSelection - this.startTimeSelection) < 0.01) {
          this.clearSelection();
        } else {
          // Dispatch event about selection change
          const selectionEvent = new CustomEvent('audioeditorselection', {
            bubbles: true,
            composed: true,
            detail: {
              startTime: this.startTimeSelection,
              endTime: this.endTimeSelection
            }
          });
          this.dispatchEvent(selectionEvent);
        }
      }
    });
    
    this.waveformCanvas.addEventListener('dblclick', () => {
      this.clearSelection();
    });
  }

  /**
   * Clear the current selection
   */
  public clearSelection(): void {
    this.startTimeSelection = -1;
    this.endTimeSelection = -1;
    if (this.selectionElement) {
      this.selectionElement.style.display = 'none';
    }
    
    // Dispatch event that selection was cleared
    const clearEvent = new CustomEvent('audioeditorselectionclear', {
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(clearEvent);
  }

  /**
   * Restore selection display after view changes (like scrolling or zooming)
   */
  private restoreSelectionAfterViewChange(): void {
    // We zooming or scrolling we obviously have to re-display the selection (blue) accordingly
    if (this.startTimeSelection !== this.endTimeSelection) {
      const startRatio = (this.startTimeSelection - this.visibleStart) / (this.visibleEnd - this.visibleStart);
      const endRatio = (this.endTimeSelection - this.visibleStart) / (this.visibleEnd - this.visibleStart);
      
      this.selectionStartX = startRatio * this.waveformCanvas.width;
      this.selectionEndX = endRatio * this.waveformCanvas.width;
      
      this.updateSelectionDisplay();
    }
  }

  /**
   * Update the visual display of the selection area
   */
  private updateSelectionDisplay(): void {
    if (!this.selectionElement) return;
    
    const left = Math.min(this.selectionStartX, this.selectionEndX);
    const width = Math.abs(this.selectionEndX - this.selectionStartX);
    
    this.selectionElement.style.left = `${left}px`;
    this.selectionElement.style.width = `${width}px`;
    this.selectionElement.style.display = width > 0 ? 'block' : 'none';
  }

  private onCloseButtonClick() {
    const closeEvent = new CustomEvent('audioeditorclose', {
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(closeEvent);
  }

  /** Normalize button behaviour. Requires an audio range that is selected to work */
  private onNormalizeButtonClick() {
    if (!this.audioBuffer || this.startTimeSelection < 0 || this.endTimeSelection < 0) {
      console.warn('Normalization requires an active selection and a loaded audio buffer.');
      return;
    }

    const currentVisibleStart = this.visibleStart;
    const currentVisibleEnd = this.visibleEnd;
    const currentPlayheadPosition = this.playheadPosition;

    const normalizedBuffer = this.normalizeAudioBufferSegment(this.audioBuffer, this.startTimeSelection, this.endTimeSelection);
    
    this.setAudioBuffer(normalizedBuffer, this.audioStartTime);
    
    this.refreshView(currentVisibleStart, currentVisibleEnd);
    
    const scrollBar = this.shadow.getElementById("scrollBar") as HTMLInputElement;
    if (scrollBar) {
      scrollBar.value = currentVisibleStart.toString();
    }
    
    this.updatePlayhead(currentPlayheadPosition * 1000);
    
    const normalizeEvent = new CustomEvent('audiobufferchange', {
      bubbles: true,
      composed: true,
      detail: { normalizedBuffer }
    });
    this.dispatchEvent(normalizeEvent);
  }

  /** Normalizes a specified segment of a given audio buffer */
  private normalizeAudioBufferSegment(
    audioBuffer: AudioBuffer,
    startTime: number,
    endTime: number
  ): AudioBuffer {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;
  
    const startSample = Math.max(0, Math.floor(startTime * sampleRate));
    const endSample = Math.min(length, Math.floor(endTime * sampleRate));
  
    let maxAmplitude = 0;
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const data = audioBuffer.getChannelData(channel);
      for (let i = startSample; i < endSample; i++) {
        const abs = Math.abs(data[i]);
        if (abs > maxAmplitude) {
          maxAmplitude = abs;
        }
      }
    }
  
    if (maxAmplitude === 0) {
      return audioBuffer;
    }
  
    const normalizationFactor = 1 / maxAmplitude;
  
    const context = new AudioContext();
    const newBuffer = context.createBuffer(numberOfChannels, length, sampleRate);
  
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const input = audioBuffer.getChannelData(channel);
      const output = newBuffer.getChannelData(channel);
  
      for (let i = 0; i < length; i++) {
        if (i >= startSample && i < endSample) {
          output[i] = input[i] * normalizationFactor;
        } else {
          output[i] = input[i];
        }
      }
    }
  
    return newBuffer;
  }

  /**
   * Set up mouse wheel zoom functionality
   */
  private setupWheelZoom(): void {
    const container = this.shadow.querySelector('.timeline-waveform-container') as HTMLElement;
    const zoomSlider = this.shadow.getElementById("zoomSlider") as HTMLInputElement;
    
    if (!container || !zoomSlider) return;
    
    // Add wheel event listener to container
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      
      const zoomDirection = e.deltaY < 0 ? 1 : -1;
      const zoomIncrement = this.currentZoom < 5 ? 0.5 : (this.currentZoom < 20 ? 1 : 2);
      let newZoom = this.currentZoom + (zoomDirection * zoomIncrement);
      
      newZoom = Math.max(0.5, Math.min(100, newZoom));
      
      const rect = container.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorPosRatio = cursorX / this.waveformCanvas.width;
      const cursorPosSecs = this.visibleStart + cursorPosRatio * (this.visibleEnd - this.visibleStart);
      
      // Determine zoom center point
      let zoomCenterSecs;
      const edgeBuffer = (this.visibleEnd - this.visibleStart) * 0.1; // 10% buffer from edge
      
      if (this.isPlayheadInVisibleRange(this.playheadPosition * 1000) && 
          this.playheadPosition >= (this.visibleStart + edgeBuffer) &&
          this.playheadPosition <= (this.visibleEnd - edgeBuffer)) {
        // Use playhead position as zoom center
        zoomCenterSecs = this.playheadPosition;
      } else {
        // Use cursor position as fallback
        zoomCenterSecs = cursorPosSecs;
      }
      
      // Calculate the new visible range based on center point and new zoom
      const visibleDuration = this.canvasDuration / newZoom;
      const newStart = Math.max(0, zoomCenterSecs - (visibleDuration / 2));
      const newEnd = Math.min(this.canvasDuration, newStart + visibleDuration);
      
      zoomSlider.value = newZoom.toString();
    
      this.currentZoom = newZoom;
      
      // Refresh the view with new range
      this.refreshView(newStart, newEnd);
    }, { passive: false });
  }

  /**
   * Initialize the playhead element and set up interactivity
   */
  private initPlayhead(): void {
    this.playheadElement = this.shadow.getElementById("audioEditorPlayhead") as HTMLElement;
    if (!this.playheadElement) return;
    
    this.playheadElement.style.cursor = 'col-resize';
    
    const container = this.shadow.querySelector('.timeline-waveform-container') as HTMLElement;
    if (!container) return;
    
    // To allow dragging the playhead
    this.playheadElement.addEventListener('mousedown', (e) => {
      this.isDraggingPlayhead = true;
      e.preventDefault();
      
      this.playheadElement.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
      document.body.style.cursor = 'col-resize';
      
      this.playheadElement.style.transition = 'none';
    });
    
    // To allow moving the playhead by clicking on the top of the timeline (same as main app)
    container.addEventListener('mousedown', (e) => {
      if (e.target === container || 
          e.target === this.waveformCanvas || 
          e.target === this.timelineCanvas) {
        const rect = container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        
        this.movePlayheadToPosition(x);
        this.isDraggingPlayhead = true;
        
        this.playheadElement.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        document.body.style.cursor = 'col-resize';
        this.playheadElement.style.transition = 'none';
      }
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!this.isDraggingPlayhead) return;
      
      const rect = container.getBoundingClientRect();
      let x = e.clientX - rect.left;
      
      x = Math.max(0, Math.min(x, container.offsetWidth));
      
      this.movePlayheadToPosition(x);
    });
    
    // Stopped dragging
    document.addEventListener('mouseup', () => {
      if (!this.isDraggingPlayhead) return;
      
      this.isDraggingPlayhead = false;
      
      this.playheadElement.style.backgroundColor = 'rgba(200, 200, 200, 0.7)';
      document.body.style.cursor = 'default';
      this.playheadElement.style.transition = 'left 0.05s linear';
    });
  }

  /**
   * Move the playhead to a specific pixel position in the editor
   * @param pixelPosition X position in pixels within the waveform container
   */
  private movePlayheadToPosition(pixelPosition: number): void {
    if (!this.waveformCanvas) return;
    
    const positionRatio = pixelPosition / this.waveformCanvas.width;
    const timeInSeconds = this.visibleStart + positionRatio * (this.visibleEnd - this.visibleStart);
    
    this.playheadPosition = timeInSeconds;
    
    this.playheadElement.style.left = `${pixelPosition}px`;
    this.playheadElement.style.display = 'block';

    if (this.isDraggingPlayhead) {
      const edgeThreshold = this.waveformCanvas.width * 0.15; // 15% from edge
      const scrollBar = this.shadow.getElementById("scrollBar") as HTMLInputElement;
      
      if (scrollBar) {
        const visibleDuration = this.visibleEnd - this.visibleStart;
        let newStart = this.visibleStart;
        let needsRefresh = false;
        
        // If the playhead is too close to the right edge, we move to the right
        if (pixelPosition > this.waveformCanvas.width - edgeThreshold) {
          // Calculate how far into the edge zone we are (as a percentage)
          const edgeDepth = (pixelPosition - (this.waveformCanvas.width - edgeThreshold)) / edgeThreshold;
          // Scroll by a percentage of visible duration based on edge depth
          const scrollAmount = Math.min(visibleDuration * 0.1 * edgeDepth, 
                                      this.canvasDuration - visibleDuration - this.visibleStart);
          
          if (scrollAmount > 0) {
            // We know we will scroll and thus need a visual refresh + wave recalculation
            newStart = this.visibleStart + scrollAmount;
            needsRefresh = true;
          }
        }
        else if (pixelPosition < edgeThreshold) {
          const edgeDepth = (edgeThreshold - pixelPosition) / edgeThreshold;
          const scrollAmount = Math.min(visibleDuration * 0.1 * edgeDepth, this.visibleStart);
          
          if (scrollAmount > 0) {
            newStart = this.visibleStart - scrollAmount;
            needsRefresh = true;
          }
        }
        
        if (needsRefresh) {
          scrollBar.value = newStart.toString();
          this.refreshView(newStart, newStart + visibleDuration);
          
          const newPositionRatio = (this.playheadPosition - newStart) / visibleDuration;
          const newPixelPosition = newPositionRatio * this.waveformCanvas.width;
          this.playheadElement.style.left = `${newPixelPosition}px`;
        }
      }
    }

    // Dispatch custom event to notify application about playhead movement
    const event = new CustomEvent('audioeditorplayheadmove', {
      bubbles: true, 
      composed: true,
      detail: {
        positionMs: timeInSeconds * 1000,
        source: 'audioeditor'
      }
    });
    
    this.dispatchEvent(event);
  }
  
  /**
   * Initialize an empty canvas with time markers
   */
  private initializeEmptyCanvas(): void {
    const ctx = this.waveformCanvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, this.waveformCanvas.width, this.waveformCanvas.height);
    
    ctx.beginPath();
    ctx.moveTo(0, this.waveformCanvas.height / 2);
    ctx.lineTo(this.waveformCanvas.width, this.waveformCanvas.height / 2);
    ctx.strokeStyle = "#333";
    ctx.stroke();
  }

  /**
   * Draws a basic timeline with time markers. Beware that this is a simple version only referring to time, we should be using
   * the grid used in main app.
   * @param start Start time in seconds
   * @param end End time in seconds
   */
  private drawTimeline(start: number, end: number): void {
    if (!this.timelineCanvas) return;
    
    const ctx = this.timelineCanvas.getContext("2d");
    if (!ctx) return;
    
    const width = this.timelineCanvas.width;
    const height = this.timelineCanvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    ctx.font = "10px Arial";
    ctx.fillStyle = "#aaa";
    ctx.textAlign = "center";
    
    const duration = end - start;
    
    // Determine appropriate time interval based on zoom level
    let interval: number;
    let minorTickCount: number = 5; // Default number of minor ticks between major ticks
    
    if (duration <= 0.5) {
      interval = 0.1;
      minorTickCount = 10;
    } else if (duration <= 1) {
      interval = 0.2;
      minorTickCount = 4;
    } else if (duration <= 3) {
      interval = 0.5;
      minorTickCount = 5;
    } else if (duration <= 10) {
      interval = 1;
      minorTickCount = 5;
    } else if (duration <= 30) {
      interval = 5;
      minorTickCount = 5;
    } else if (duration <= 60) {
      interval = 10;
      minorTickCount = 10;
    } else if (duration <= 300) {
      interval = 30;
      minorTickCount = 6;
    } else {
      interval = 60;
      minorTickCount = 6;
    }
    
    const minorInterval = interval / minorTickCount;
    
    const firstMinorTick = Math.ceil(start / minorInterval) * minorInterval;
    
    for (let time = firstMinorTick; time < end; time += minorInterval) {
      const x = ((time - start) / duration) * width;
      const isMajorTick = Math.abs(time % interval) < 0.0001;
      const hasAudioContent = this.audioBuffer && time < this.audioBuffer.duration && time >= 0;
      
      if (isMajorTick) {
        ctx.beginPath();
        ctx.moveTo(x, 20);
        ctx.lineTo(x, height);
        ctx.strokeStyle = "rgba(136, 136, 136, 0.3)";
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 16);
        ctx.strokeStyle = "#888";
        ctx.stroke();
        
        let formattedTime: string;
        if (time < 60) {
          formattedTime = time.toFixed(1) + "s";
        } else {
          const minutes = Math.floor(time / 60);
          const seconds = time % 60;
          formattedTime = `${minutes}:${seconds.toFixed(0).padStart(2, '0')}`;
        }
        
        ctx.fillText(formattedTime, x, 14);
      } else {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 10);
        ctx.strokeStyle = "#444";
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(x, 20);
        ctx.lineTo(x, height);
        ctx.strokeStyle = "rgba(68, 68, 68, 0.2)";
        ctx.stroke();
      }
    }
    
    ctx.beginPath();
    ctx.moveTo(0, 20);
    ctx.lineTo(width, 20);
    ctx.strokeStyle = "#666";
    ctx.stroke();
    
    if (this.audioBuffer) {
        const audioStart = this.audioStartTime;
        const audioEnd = this.audioStartTime + this.audioBuffer.duration;
        
        if (audioStart >= start && audioStart <= end) {
            const audioStartX = ((audioStart - start) / duration) * width;
            this.drawAudioBoundaryMarker(ctx, audioStartX, height, "Start");
        }
        
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
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.strokeStyle = "rgba(255, 80, 80, 0.7)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;
    
    ctx.font = "10px Arial";
    ctx.fillStyle = "#f88";
    ctx.textAlign = "center";
    ctx.fillText(`Audio ${label}`, x, height - 5);
  }

  private displayZoomLevelInfo(zoomDisplay: HTMLElement, calculatedZoom: number, visualZoom: number): void {
    if (calculatedZoom === visualZoom) {
      zoomDisplay.textContent = `${visualZoom.toFixed(1)}x`;
    } else {
      zoomDisplay.textContent = `${visualZoom.toFixed(1)}x`;
    }
  }

  /** Sets the global audio buffer for this canvas
   * Currently we are limited to one audio buffer in the component.
   * We could keep working with one general buffer, having multiple audio segments would only
   * be a visual representation of one big buffer with simple blanks in the time.
   * Or we could allow multiple buffers
   */
  public setAudioBuffer(buffer: AudioBuffer, startTimeSeconds: number): void {
      this.audioBuffer = buffer;
      this.audioStartTime = startTimeSeconds;
      
      this.currentWaveformDrawer = null;
      this.lastCalculatedZoom = 1;
      
      const visibleDuration = this.visibleEnd - this.visibleStart;

      const newStart = Math.max(0, startTimeSeconds - (visibleDuration / 2));
      const newEnd = newStart + visibleDuration;

      const updateUI = (start: number, end: number) => {
        this.refreshView(start, end);
      };
      
      updateUI(newStart, newEnd);
      
      const scrollBar = this.shadow.getElementById("scrollBar") as HTMLInputElement;
      if (scrollBar) {
        scrollBar.value = newStart.toString();
      }

      this.clearSelection();
  }

  /** Refresh the view in the editor */
  private refreshView(start: number, end: number): void {
    console.log("refresh view start: ", start, " end: ", end);
    const zoomValue = this.shadow.getElementById("zoomValue") as HTMLElement;
    const zoomInput = this.shadow.getElementById("zoomInput") as HTMLInputElement;
    const scrollBar = this.shadow.getElementById("scrollBar") as HTMLInputElement;
    
    const ctx = this.waveformCanvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, this.waveformCanvas.width, this.waveformCanvas.height);
    
    if (this.audioBuffer) {
      const audioDuration = this.audioBuffer.duration;
      const audioStart = this.audioStartTime;
      const audioEnd = audioStart + audioDuration;
      
      if (start < audioEnd && end > audioStart) {
        const visibleAudioStart = Math.max(start, audioStart);
        const visibleAudioEnd = Math.min(end, audioEnd);
        
        const calculatedZoomLevel = this.getNearestLowerMilestone(this.currentZoom);
        
        const needsRecalculation = 
          !this.currentWaveformDrawer || // First render
          calculatedZoomLevel !== this.lastCalculatedZoom || // Zoom milestone changed
          this.visibleStart !== start || // Visible range changed
          this.visibleEnd !== end; // Visible range changed
          
        if (needsRecalculation) {
          this.lastCalculatedZoom = calculatedZoomLevel;
          
          this.currentWaveformDrawer = new WaveformDrawer();
          
          const audioOffsetSec = visibleAudioStart - audioStart;
          const audioDurationSec = visibleAudioEnd - visibleAudioStart;
          
          this.currentWaveformDrawer.init(
            this.audioBuffer, 
            this.waveformCanvas, 
            DEFAULT_PRECISION, 
            audioOffsetSec, // Start position within buffer (relative to buffer start)
            audioOffsetSec + audioDurationSec, // End position within buffer
            calculatedZoomLevel
          );
        }
        
        // Calculate what percentage of the view should be occupied by the audio
        // and where it should be positioned
        const startOffset = (visibleAudioStart - start) / (end - start) * this.waveformCanvas.width;
        const visibleWidth = (visibleAudioEnd - visibleAudioStart) / (end - start) * this.waveformCanvas.width;
        
        // Draw the wave at the correct position with the correct width
        if (this.currentWaveformDrawer) {
          this.currentWaveformDrawer.drawWave(startOffset, visibleWidth, this.currentZoom);
          
          // Update display to indicate if we're using a calculated or visual zoom
          this.displayZoomLevelInfo(zoomValue, this.lastCalculatedZoom, this.currentZoom);
        }
      }
    }
    
    this.drawTimeline(start, end);
    
    this.visibleStart = start;
    this.visibleEnd = end;

    this.updatePlayhead(this.playheadPosition * 1000);

    this.restoreSelectionAfterViewChange();

    zoomInput.value = this.currentZoom.toFixed(1);
    
    const visibleDuration = end - start;
    const maxScroll = this.canvasDuration - visibleDuration;
    
    scrollBar.min = "0";
    scrollBar.max = maxScroll > 0 ? maxScroll.toFixed(2) : "0";
    scrollBar.value = start.toFixed(2);
    scrollBar.disabled = maxScroll <= 0;
  }
  

  // -------------------------------
  // Playhead management
  // -------------------------------

  /**
   * Update the playhead position based on the application playhead time
   * @param appPlayheadTimeMs Application playhead time in milliseconds
   * @param isPlayback Whether this update is from active playback
   */
  public updatePlayhead(appPlayheadTimeMs: number, isPlayback: boolean = false): void {
    if (this.isDraggingPlayhead) return;
    
    // Store position in seconds
    this.playheadPosition = appPlayheadTimeMs / 1000;
    
    // Check if playhead time is within our visible range
    if (this.playheadPosition >= this.visibleStart && this.playheadPosition <= this.visibleEnd) {
      // Calculate position within the viewport
      const positionRatio = (this.playheadPosition - this.visibleStart) / (this.visibleEnd - this.visibleStart);
      const pixelPosition = positionRatio * this.waveformCanvas.width;
      
      // Update playhead position - remove transition during playback for smoother updates
      this.playheadElement.style.transition = isPlayback ? 'none' : 'left 0.05s linear';
      this.playheadElement.style.left = `${pixelPosition}px`;
      this.playheadElement.style.display = 'block';
      
      // Get scrollbar for viewport control
      const scrollBar = this.shadow.getElementById("scrollBar") as HTMLInputElement;
      if (scrollBar && isPlayback) {
        const visibleDuration = this.visibleEnd - this.visibleStart;
        let newStart = this.visibleStart;
        
        if (this.usePageBasedScrolling) {
          // PAGE-BASED SCROLLING BEHAVIOR
          // Check if playhead is near the edge of the viewport (>90%)
          const edgeThreshold = this.waveformCanvas.width * 0.9;
          
          if (pixelPosition > edgeThreshold) {
            // Jump forward by one page (current visible duration)
            newStart = Math.min(
              this.visibleStart + visibleDuration * 0.9, // Overlap by 10%
              this.canvasDuration - visibleDuration // Don't scroll past the end
            );
            
            // Update scrollbar and view if we need to move
            if (newStart > this.visibleStart) {
              scrollBar.value = newStart.toFixed(2);
              this.refreshView(newStart, newStart + visibleDuration);
            }
          }
        } else {
          // DYNAMIC CENTER-ALIGNED SCROLLING BEHAVIOR
          // Check if playhead passes the center of the viewport
          const centerThreshold = this.waveformCanvas.width * 0.5;
          
          if (pixelPosition > centerThreshold) {
            const pastCenter = pixelPosition - centerThreshold;
            const pastCenterRatio = pastCenter / centerThreshold;

            const movementAmount = pastCenterRatio * (this.playheadPosition - this.visibleStart) * 0.1;
            
            newStart = Math.min(
              this.visibleStart + movementAmount,
              this.canvasDuration - visibleDuration
            );
            
            if (newStart > this.visibleStart) {
              scrollBar.value = newStart.toFixed(2);
              this.refreshView(newStart, newStart + visibleDuration);
            }
          }
        }
      }
    } else {
      // Hide playhead if not in visible range
      this.playheadElement.style.display = 'none';
    }
  }

  /**
   * Check if the application playhead time is within the visible audio range
   * @param appPlayheadTimeMs Application playhead time in milliseconds
   * @returns Boolean indicating if playhead is in visible range
   */
  public isPlayheadInVisibleRange(appPlayheadTimeMs: number): boolean {
    const playheadSec = appPlayheadTimeMs / 1000;
    return playheadSec >= this.visibleStart && playheadSec <= this.visibleEnd;
  }
}

customElements.define("audio-editor-element", AudioEditorElement)

export class WaveformDrawer {
  private decodedAudioBuffer: AudioBuffer | null = null;
  private peaks: Float32Array | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private sampleStep: number = DEFAULT_PRECISION;
  private calculatedZoomLevel: number = 1; 

  init(
    decodedAudioBuffer: AudioBuffer,
    canvas: HTMLCanvasElement,
    sampleStep: number = DEFAULT_PRECISION,
    startSec: number = 0,
    endSec: number | null = null,
    zoomLevel: number = 1
  ): void {
    this.decodedAudioBuffer = decodedAudioBuffer;
    this.canvas = canvas;
    this.sampleStep = sampleStep;
    this.calculatedZoomLevel = zoomLevel;
    this.getPeaks(startSec, endSec);
  }

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

  drawWave(startX: number = 0, width: number = 0, visualZoom: number = 1): void {
    if (!this.canvas || !this.peaks) return;

    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;

    const canvasWidth = this.canvas.width;
    const height = this.canvas.height;
    const halfH = height / 2;
    const coef = halfH;

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
    
    const drawWidth = width > 0 ? Math.min(width, canvasWidth - startX) : canvasWidth;
    
    ctx.moveTo(startX, halfH);
    
    const totalPeaks = this.peaks.length;
    
    for (let i = 0; i < drawWidth; i++) {
      const peakIndex = Math.floor((i / drawWidth) * totalPeaks);
      
      if (peakIndex >= 0 && peakIndex < totalPeaks) {
        const val = this.peaks[peakIndex] * coef;
        ctx.lineTo(startX + i, halfH - val);
      } else {
        ctx.lineTo(startX + i, halfH);
      }
    }
    
    for (let i = drawWidth - 1; i >= 0; i--) {
      const peakIndex = Math.floor((i / drawWidth) * totalPeaks);
      
      if (peakIndex >= 0 && peakIndex < totalPeaks) {
        const val = this.peaks[peakIndex] * coef;
        ctx.lineTo(startX + i, halfH + val);
      } else {
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
    
    for (let i = 0; i < drawWidth; i++) {
      if (visualZoom > 5 && i % 2 !== 0) continue;
      
      const peakIndex = Math.floor((i / drawWidth) * totalPeaks);
      
      if (peakIndex >= 0 && peakIndex < totalPeaks) {
        const val = this.peaks[peakIndex] * coef;
        ctx.moveTo(startX + i, halfH - val);
        ctx.lineTo(startX + i, halfH + val);
      }
    }
    
    ctx.stroke();
  }
  
}