import { Component, ElementRef, ViewChild, AfterViewInit } from '@angular/core';

declare const cv: any;

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements AfterViewInit {
  @ViewChild('videoPlayer') videoPlayer!: ElementRef;
  @ViewChild('videoInput') videoInput!: ElementRef;
  streaming: boolean = false;
  canvas: any;
  context: any;
  isSelecting = false;
  selectedRegion: any = null;
  showVideoControls: boolean = false;
  videoElement!: HTMLVideoElement;
  cap: any;
  roiHist: any;
  trackWindow: any;
  termCrit: any;
  width: number = 718;
  height: number = 480;
  async ngAfterViewInit() {
    await this.initOpenCV();
    (window as any).addEventListener('resize', (event: any) => {});
  }

  async initOpenCV() {
    try {
      await new Promise((resolve: any) => {
        (window as any).onOpenCvReady = () => resolve();
      });
      console.log('OpenCV.js is ready');
    } catch (error) {
      console.error('Error initializing OpenCV:', error);
    }
  }

  // Track the selected object in the video

  async trackObject() {
    let video: HTMLVideoElement = document.getElementById(
      'video'
    ) as HTMLVideoElement;
    let cap = new cv.VideoCapture(video);
    video.height = video.videoHeight;
    video.width = video.videoWidth;
    let canvasRect = this.canvas.getBoundingClientRect();
    let frame = new cv.Mat(video.height, video.width, cv.CV_8UC4);
    cap.read(frame);
    // hardcode the initial location of windo
    let trackWindow: any;
    if (this.selectedRegion) {
      trackWindow = new cv.Rect(
        this.selectedRegion.x,
        this.selectedRegion.y,
        this.selectedRegion.width,
        this.selectedRegion.height
      );
    } else trackWindow = new cv.Rect(150, 60, 63, 125);

    // set up the ROI for tracking
    let roi = frame.roi(trackWindow);
    let hsvRoi = new cv.Mat();
    cv.cvtColor(roi, hsvRoi, cv.COLOR_RGBA2RGB);
    cv.cvtColor(hsvRoi, hsvRoi, cv.COLOR_RGB2HSV);
    let mask = new cv.Mat();
    let lowScalar = new cv.Scalar(30, 30, 0);
    let highScalar = new cv.Scalar(180, 180, 180);
    let low = new cv.Mat(hsvRoi.rows, hsvRoi.cols, hsvRoi.type(), lowScalar);
    let high = new cv.Mat(hsvRoi.rows, hsvRoi.cols, hsvRoi.type(), highScalar);
    cv.inRange(hsvRoi, low, high, mask);
    let roiHist = new cv.Mat();
    let hsvRoiVec = new cv.MatVector();
    hsvRoiVec.push_back(hsvRoi);
    cv.calcHist(hsvRoiVec, [0], mask, roiHist, [180], [0, 180]);
    cv.normalize(roiHist, roiHist, 0, 255, cv.NORM_MINMAX);
    // delete useless mats.
    roi.delete();
    hsvRoi.delete();
    mask.delete();
    low.delete();
    high.delete();
    hsvRoiVec.delete();
    // Setup the termination criteria, either 10 iteration or move by at least 1 pt
    let termCrit = new cv.TermCriteria(
      cv.TERM_CRITERIA_EPS | cv.TERM_CRITERIA_COUNT,
      10,
      1
    );
    let hsv = new cv.Mat(video.height, video.width, cv.CV_8UC3);
    let hsvVec = new cv.MatVector();
    hsvVec.push_back(hsv);
    let dst = new cv.Mat();
    let trackBox = null;
    const FPS = 30;
    const processVideo = () => {
      try {
        if (!this.streaming) {
          // clean and stop.
          frame.delete();
          dst.delete();
          hsvVec.delete();
          roiHist.delete();
          hsv.delete();
          return;
        }
        let begin = Date.now();
        // start processing.
        cap.read(frame);
        cv.cvtColor(frame, hsv, cv.COLOR_RGBA2RGB);
        cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
        cv.calcBackProject(hsvVec, [0], roiHist, dst, [0, 180], 1);
        // apply camshift to get the new location
        [trackBox, trackWindow] = cv.CamShift(dst, trackWindow, termCrit);
        // Draw the tracked object on the image
        let pts = cv.rotatedRectPoints(trackBox);
        cv.line(frame, pts[0], pts[1], [255, 0, 0, 255], 3);
        cv.line(frame, pts[1], pts[2], [255, 0, 0, 255], 3);
        cv.line(frame, pts[2], pts[3], [255, 0, 0, 255], 3);
        cv.line(frame, pts[3], pts[0], [255, 0, 0, 255], 3);
        cv.imshow('canvas', frame);
        // schedule the next one.
        let delay = 1000 / FPS - (Date.now() - begin);
        setTimeout(processVideo, delay);
      } catch (err) {
        console.log('err', err);
      }
    };

    // schedule the first one.
    setTimeout(processVideo, 0);
  }

  onVideoSelected(event: any) {
    const file = event.target.files[0];
    this.videoElement = this.videoPlayer.nativeElement;
    this.videoElement.srcObject = null;
    const url = URL.createObjectURL(file);
    if (url) {
      this.showVideoControls = true;
    }
    this.videoElement.src = url;
  }

  triggerVideoUpload() {
    // this.videoElement = this.videoPlayer.nativeElement;
    this.canvas = null;
    this.videoInput.nativeElement.click();
  }

  onVideoLoad() {
    this.videoElement = this.videoPlayer.nativeElement;
    this.canvas = document.getElementById('canvas');
    this.canvas.setAttribute('style', 'border:1px solid #615454;');
    this.context = this.canvas.getContext('2d');
    this.canvas.width = this.videoElement.videoWidth;
    this.canvas.height = this.videoElement.videoHeight;
  }

  // Play/pause video and start/stop tracking
  onPlayPause() {
    if (this.videoElement.paused) {
      this.videoElement.play();
      this.streaming = true;
      this.trackObject();
    } else {
      this.videoElement.pause();
      this.streaming = false;
    }
  }

  // Handle mouse down event for selecting region
  onMouseDown(event: MouseEvent) {
    this.isSelecting = true;
    const x = event.offsetX;
    const y = event.offsetY;
    this.selectedRegion = { x, y, width: 0, height: 0 };
  }

  // Handle mouse move event for updating selected region
  onMouseMove(event: MouseEvent) {
    if (this.isSelecting) {
      const x = event.offsetX;
      const y = event.offsetY;
      this.selectedRegion.width = x - this.selectedRegion.x;
      this.selectedRegion.height = y - this.selectedRegion.y;
      this.drawSelectedRegion();
    }
  }

  // Handle mouse up event for ending region selection
  onMouseUp() {
    this.isSelecting = false;
    this.streaming = false;
  }

  // Draw the selected region on the canvas
  drawSelectedRegion() {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.strokeStyle = '#FF0000';
    this.context.lineWidth = 1;
    this.context.strokeRect(
      this.selectedRegion.x,
      this.selectedRegion.y,
      this.selectedRegion.width,
      this.selectedRegion.height
    );
  }
  initCamera() {
    this.canvas = null;
    this.onVideoLoad();
    this.showVideoControls = true;
    this.videoElement.src = '';
    this.context = null;
    this.selectedRegion = null;
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        this.videoElement.srcObject = stream;
        this.videoElement.play();
      })
      .catch((error) => {});
  }
}
