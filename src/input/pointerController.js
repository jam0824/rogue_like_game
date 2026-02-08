function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toWorldPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
  const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  return {
    x: clamp(x, 0, Math.max(0, canvas.width - 1)),
    y: clamp(y, 0, Math.max(0, canvas.height - 1)),
  };
}

export function createPointerController(canvas, handlers) {
  let activePointerId = null;

  function emitActiveTarget(event) {
    const point = toWorldPoint(canvas, event);
    handlers.onPointerTarget(true, point.x, point.y);
  }

  function releasePointer(event) {
    if (event.pointerId !== activePointerId) {
      return;
    }

    activePointerId = null;
    handlers.onPointerTarget(false, null, null);
  }

  function onPointerDown(event) {
    if (event.button !== 0 || activePointerId !== null) {
      return;
    }

    activePointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    emitActiveTarget(event);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (event.pointerId !== activePointerId) {
      return;
    }

    emitActiveTarget(event);
  }

  function onPointerUp(event) {
    releasePointer(event);
  }

  function onPointerCancel(event) {
    releasePointer(event);
  }

  function onLostPointerCapture(event) {
    releasePointer(event);
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("lostpointercapture", onLostPointerCapture);

  return {
    destroy() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("lostpointercapture", onLostPointerCapture);
    },
  };
}
