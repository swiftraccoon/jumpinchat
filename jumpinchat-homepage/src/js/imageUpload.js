import Cropper from 'cropperjs';

const dimensionsByType = {
  useravatar: { width: 256, height: 256 },
  roomdisplay: { width: 320, height: 240 },
};

// The crop area fills the original fixed viewport; drag and zoom the image.
const cropTemplate = '<cropper-canvas background>'
  + '<cropper-image scalable translatable></cropper-image>'
  + '<cropper-handle action="move" plain></cropper-handle>'
  + '<cropper-selection initial-coverage="1">'
  + '<cropper-grid role="grid" bordered covered></cropper-grid>'
  + '<cropper-crosshair centered></cropper-crosshair>'
  + '</cropper-selection></cropper-canvas>';

export default class ImageUpload {
  constructor(elemSelector = '.imageUpload__Form') {
    this.targetElement = document.querySelector(elemSelector);
    this.dimensions = dimensionsByType[elemSelector.match(/--(\w+)$/)?.[1]];
    this.generation = 0;
    this.cropper = null;
    this.objectUrl = null;
    this.uploading = false;
    this.ready = false;
    if (this.targetElement && this.dimensions && 'FormData' in window) this.createImageUpload();
  }

  createImageUpload() {
    const form = this.targetElement;
    this.container = form.querySelector('.imageUpload__Container');
    this.preview = form.querySelector('.imageUpload__Preview');
    this.submitButton = form.querySelector('.imageUpload__UploadButton');
    this.loading = form.querySelector('.imageUpload__Loading');
    this.success = form.querySelector('.imageUpload__Status--success');
    this.error = form.querySelector('.imageUpload__Status--error');
    Object.assign(this.container.style, {
      width: `${this.dimensions.width}px`, height: `${this.dimensions.height}px`,
    });
    for (const eventName of ['dragover', 'dragenter', 'dragleave', 'drop']) {
      form.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        form.classList.toggle('imageUpload__Container--dragover', ['dragover', 'dragenter'].includes(eventName));
        if (eventName === 'drop') this.selectFile(event.dataTransfer?.files[0]);
      });
    }
    form.querySelector('.imageUpload__File').addEventListener('change', event => this.selectFile(event.target.files[0]));
    // Register once; choosing another file must not create another upload handler.
    form.addEventListener('submit', event => this.upload(event));
  }

  showError(message) {
    this.error.textContent = message;
    this.error.classList.remove('u-hidden');
  }

  async selectFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.showError('Choose an image file.');
      return;
    }
    const generation = ++this.generation;
    this.ready = false;
    this.cropper?.getCropperCanvas()?.remove();
    this.cropper = null;
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    this.preview.src = this.objectUrl;
    this.error.classList.add('u-hidden');
    this.success.classList.add('u-hidden');
    this.submitButton.disabled = true;
    this.targetElement.querySelector('.imageUpload__Label').classList.add('imageUpload__Label--hasImage');
    try {
      const cropper = new Cropper(this.preview, { container: this.container, template: cropTemplate });
      this.cropper = cropper;
      const image = cropper.getCropperImage();
      const selection = cropper.getCropperSelection();
      image.rotatable = false;
      image.skewable = false;
      image.initialFit = 'cover';
      selection.aspectRatio = this.dimensions.width / this.dimensions.height;
      selection.initialCoverage = 1;
      await image.$ready();
      if (generation !== this.generation) return;
      image.$center('cover');
      selection.$change(0, 0, this.dimensions.width, this.dimensions.height, selection.aspectRatio);
      // Cropper 2.2 exposes the proposed image bounds before each transform.
      // Keep all four sides covering the viewport, matching the old viewMode 3.
      image.addEventListener('change', (event) => {
        const { x, y, width, height } = event.detail;
        const tolerance = 0.5;
        if (x > tolerance || y > tolerance
          || x + width < this.dimensions.width - tolerance
          || y + height < this.dimensions.height - tolerance) event.preventDefault();
      });
      this.submitButton.classList.add('imageUpload__UploadButton--visible');
      this.ready = true;
      this.submitButton.disabled = this.uploading;
    } catch (error) {
      if (generation === this.generation) {
        this.cropper?.getCropperCanvas()?.remove();
        this.cropper = null;
        this.targetElement.querySelector('.imageUpload__Label').classList.remove('imageUpload__Label--hasImage');
        this.showError('This image could not be opened. Choose another file.');
      }
    }
  }

  async upload(event) {
    event.preventDefault();
    if (!this.cropper || this.submitButton.disabled || this.uploading) return;
    this.uploading = true;
    this.submitButton.disabled = true;
    this.loading.classList.remove('u-hidden');
    this.error.classList.add('u-hidden');
    this.success.classList.add('u-hidden');
    try {
      const canvas = await this.cropper.getCropperSelection().$toCanvas(this.dimensions);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('The cropped image could not be exported.');
      const data = new FormData();
      data.append('image', blob, 'image.png');
      const response = await fetch(this.targetElement.action, { method: 'PUT', body: data });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(response.status === 413 ? 'Image is too large (max 512Kb)'
          : response.status === 404 ? 'Could not reach the API'
            : body.message || 'The image could not be uploaded.');
      }
      this.success.classList.remove('u-hidden');
    } catch (error) {
      this.showError(error.message || 'The image could not be uploaded.');
    } finally {
      this.loading.classList.add('u-hidden');
      this.uploading = false;
      this.submitButton.disabled = !this.ready;
    }
  }
}
