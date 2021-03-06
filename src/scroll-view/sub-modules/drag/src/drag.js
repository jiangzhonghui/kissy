/**
 * @ignore
 * allow body to drag
 * @author yiminghe@gmail.com
 */
KISSY.add('scroll-view/drag', function (S, ScrollViewBase, Node, Anim) {
    var OUT_OF_BOUND_FACTOR = 0.5;

    var PIXEL_THRESH = 3;

    var Gesture = Node.Gesture;

    var SWIPE_SAMPLE_INTERVAL = 300;

    var MAX_SWIPE_VELOCITY = 6;

    var $document = Node.all(document);

    function onDragStart(self, e, scrollType) {
        var now = e.timeStamp,
            scroll = self.get('scroll' + S.ucfirst(scrollType));
        self.startScroll[scrollType] = scroll;
        self.swipe[scrollType].startTime = now;
        self.swipe[scrollType].scroll = scroll;
    }

    function onDragScroll(self, e, scrollType, startMousePos) {
        if (forbidDrag(self, scrollType)) {
            return;
        }
        var pos = {
            pageX: e.touches[0].pageX,
            pageY: e.touches[0].pageY
        };
        var pageOffsetProperty = scrollType == 'left' ? 'pageX' : 'pageY',
            lastPageXY = self.lastPageXY;
        var diff = pos[pageOffsetProperty] - startMousePos[pageOffsetProperty],
        // touchend == last touchmove
            eqWithLastPoint,
            scroll = self.startScroll[scrollType] - diff,
            bound,
            now = e.timeStamp,
            minScroll = self.minScroll,
            maxScroll = self.maxScroll,
            lastDirection = self.lastDirection,
            swipe = self.swipe,
            direction;
        if (lastPageXY[pageOffsetProperty]) {
            eqWithLastPoint = pos[pageOffsetProperty] == lastPageXY[pageOffsetProperty];
            direction = ( pos[pageOffsetProperty] - lastPageXY[pageOffsetProperty]) > 0;
        }

        if (!self.get('bounce')) {
            scroll = Math.min(Math.max(scroll, minScroll[scrollType]), maxScroll[scrollType]);
        }

        if (scroll < minScroll[scrollType]) {
            bound = minScroll[scrollType] - scroll;
            bound *= OUT_OF_BOUND_FACTOR;
            scroll = minScroll[scrollType] - bound;
        } else if (scroll > maxScroll[scrollType]) {
            bound = scroll - maxScroll[scrollType];
            bound *= OUT_OF_BOUND_FACTOR;
            scroll = maxScroll[scrollType] + bound;
        }

        var timeDiff = (now - swipe[scrollType].startTime);

        // swipe sample
        if (!eqWithLastPoint && lastDirection[scrollType] !== undefined &&
            lastDirection[scrollType] !== direction || timeDiff > SWIPE_SAMPLE_INTERVAL) {
            swipe[scrollType].startTime = now;
            swipe[scrollType].scroll = scroll;
            // S.log('record for swipe: ' + timeDiff + ' : ' + scroll);
        }

        self.set('scroll' + S.ucfirst(scrollType), scroll);
        lastDirection[scrollType] = direction;

        lastPageXY[pageOffsetProperty] = e[pageOffsetProperty];
    }

    function forbidDrag(self, scrollType) {
        var lockXY = scrollType == 'left' ? 'lockX' : 'lockY';
        if (!self.allowScroll[scrollType] && self.get(lockXY)) {
            return 1;
        }
        return 0;
    }

    function onDragEndAxis(self, e, scrollType, endCallback) {
        if (forbidDrag(self, scrollType)) {
            endCallback();
            return;
        }
        var scrollAxis = 'scroll' + S.ucfirst(scrollType),
            scroll = self.get(scrollAxis),
            minScroll = self.minScroll,
            maxScroll = self.maxScroll,
            now = e.timeStamp,
            swipe = self.swipe,
            bound;
        if (scroll < minScroll[scrollType]) {
            bound = minScroll[scrollType];
        } else if (scroll > maxScroll[scrollType]) {
            bound = maxScroll[scrollType];
        }
        if (bound !== undefined) {
            var scrollCfg = {};
            scrollCfg[scrollType] = bound;
            self.scrollTo(scrollCfg, {
                duration: self.get('bounceDuration'),
                easing: self.get('bounceEasing'),
                queue: false,
                complete: endCallback
            });
            return;
        }

        if (self.pagesOffset) {
            endCallback();
            return;
        }

        var duration = now - swipe[scrollType].startTime;
        var distance = (scroll - swipe[scrollType].scroll);

        // S.log('duration: ' + duration);

        if (duration == 0 || distance == 0) {
            endCallback();
            return;
        }

        //alert('duration:' + duration);
        //log('distance:' + distance);

        var velocity = distance / duration;

        velocity = Math.min(Math.max(velocity, -MAX_SWIPE_VELOCITY), MAX_SWIPE_VELOCITY);

        // S.log('velocity: ' + velocity);
        // S.log('after dragend scroll value: ' + scroll);

        var animCfg = {
            node: {},
            to: {},
            duration: 9999,
            queue: false,
            complete: endCallback,
            frame: makeMomentumFx(self, velocity, scroll,
                scrollAxis, maxScroll[scrollType],
                minScroll[scrollType])
        };

        animCfg.node[scrollType] = scroll;
        animCfg.to[scrollType] = null;

        self.scrollAnims.push(new Anim(animCfg).run());
    }

    var FRICTION = 0.5;
    var ACCELERATION = 20;
    var THETA = Math.log(1 - (FRICTION / 10)); // -0.05129329438755058
    var ALPHA = THETA / ACCELERATION; // -0.0017097764795850194
    var SPRING_TENSION = 0.3;

    function makeMomentumFx(self, startVelocity, startScroll, scrollAxis, maxScroll, minScroll) {
        // velocity>0 touch upward, move downward, scrollTop++
        var velocity = startVelocity * ACCELERATION;
        var inertia = 1;
        var bounceStartTime = 0;
        return function (anim, fx) {
            var now = S.now(),
                deltaTime,
                value;
            if (inertia) {
                deltaTime = now - anim.startTime;
                // Math.exp(-0.1) -> Math.exp(-999)
                // big -> small
                // 1 -> 0
                var frictionFactor = Math.exp(deltaTime * ALPHA);
                // 1 - e^-t
                value = parseInt(startScroll + velocity * (1 - frictionFactor) / (-THETA));
                if (value > minScroll && value < maxScroll) {
                    // inertia
                    if (fx.lastValue === value) {
                        fx.pos = 1;
                        return;
                    }
                    fx.lastValue = value;
                    self.set(scrollAxis, value);
                    return;
                }
                inertia = 0;
                velocity = velocity * frictionFactor;
                // S.log('before bounce value: ' + value);
                // S.log('before bounce startScroll: ' + value);
                // S.log('start bounce velocity: ' + velocity);
                // S.log('before bounce minScroll: ' + minScroll);
                // S.log('before bounce maxScroll: ' + maxScroll);
                startScroll = value <= minScroll ? minScroll : maxScroll;
                // S.log('startScroll value: ' + startScroll);
                bounceStartTime = now;
            } else {
                deltaTime = now - bounceStartTime;
                // bounce
                var theta = (deltaTime / ACCELERATION),
                // long tail hump
                // t * e^-t
                    powTime = theta * Math.exp(-SPRING_TENSION * theta);
                value = parseInt(velocity * powTime);
                if (value === 0) {
                    fx.pos = 1;
                }
                self.set(scrollAxis, startScroll + value);
            }
        };
    }

    function onDragStartHandler(e) {
        var self = this,
            touches = e.touches;
        if (self.get('disabled')) {
            return;
        }
        self.stopAnimation();
        var pos = {
            pageX: e.touches[0].pageX,
            pageY: e.touches[0].pageY
        };
        var isScrolling = self.isScrolling;
        if (isScrolling) {
            var pageIndex = self.get('pageIndex');
            self.fire('scrollEnd', S.mix({
                fromPageIndex: pageIndex,
                pageIndex: pageIndex
            }, pos));
        }
        if (touches.length > 1) {
            return;
        }
        initStates(self);
        self.startMousePos = pos;
        onDragStart(self, e, 'left');
        onDragStart(self, e, 'top');
        // ie10 if mouse out of window
        $document.on(Gesture.move, onDragHandler, self)
            .on(Gesture.end, onDragEndHandler, self);
    }

    function onDragHandler(e) {
        var self = this,
            touches = e.touches,
            startMousePos = self.startMousePos;

        if (!startMousePos) {
            return;
        }

        var pos = {
            pageX: touches[0].pageX,
            pageY: touches[0].pageY
        };

        var xDiff = Math.abs(pos.pageX - startMousePos.pageX);
        var yDiff = Math.abs(pos.pageY - startMousePos.pageY);

        // allow little deviation
        if (Math.max(xDiff, yDiff) < PIXEL_THRESH) {
            return;
        } else {
            if (!self.isScrolling) {
                self.fire('scrollStart', pos);
                self.isScrolling = 1;
            }
        }

        var lockX = self.get('lockX'),
            lockY = self.get('lockY');

        // if lockX or lockY then do not prevent native scroll on some condition
        if (lockX || lockY) {
            var dragInitDirection;

            if (!(dragInitDirection = self.dragInitDirection)) {
                self.dragInitDirection = dragInitDirection = xDiff > yDiff ? 'left' : 'top';
            }

            if (lockX && dragInitDirection == 'left' && !self.allowScroll[dragInitDirection]) {
                //S.log('not in right direction');
                self.isScrolling = 0;
                return;
            }

            if (lockY && dragInitDirection == 'top' && !self.allowScroll[dragInitDirection]) {
                //S.log('not in right direction');
                self.isScrolling = 0;
                return;
            }
        }

        if (S.Features.isTouchEventSupported()) {
            e.preventDefault();
        }

        onDragScroll(self, e, 'left', startMousePos);
        onDragScroll(self, e, 'top', startMousePos);

        // touchmove frequency is slow on android
        self.fire('scrollMove', pos);
    }

    if (S.UA.ie) {
        onDragHandler = S.throttle(onDragHandler, 30);
    }

    function onDragEndHandler(e) {
        var self = this;
        var startMousePos = self.startMousePos;
        $document.detach(Gesture.move, onDragHandler, self);
        if (!startMousePos || !self.isScrolling) {
            return;
        }
        var count = 0;
        var offsetX = startMousePos.pageX - e.pageX;
        var offsetY = startMousePos.pageY - e.pageY;
        var snapThreshold = self.get('snapThreshold');
        var allowX = self.allowScroll.left && Math.abs(offsetX) > snapThreshold;
        var allowY = self.allowScroll.top && Math.abs(offsetY) > snapThreshold;
        self.fire('dragend', {
            pageX: e.pageX,
            pageY: e.pageY
        });
        function endCallback() {
            count++;
            if (count == 2) {
                function scrollEnd() {
                    self.isScrolling = 0;
                    self.fire('scrollEnd', {
                        pageX: e.pageX,
                        pageY: e.pageY,
                        fromPageIndex: pageIndex,
                        pageIndex: self.get('pageIndex')
                    });
                }

                if (!self.pagesOffset) {
                    scrollEnd();
                    return;
                }

                var snapThreshold = self.get('snapThreshold');
                var snapDuration = self.get('snapDuration');
                var snapEasing = self.get('snapEasing');
                var pageIndex = self.get('pageIndex');
                var scrollLeft = self.get('scrollLeft');
                var scrollTop = self.get('scrollTop');

                var animCfg = {
                    duration: snapDuration,
                    easing: snapEasing,
                    complete: scrollEnd
                };

                var pagesOffset = self.pagesOffset.concat([]);

                self.isScrolling = 0;

                if (allowX || allowY) {
                    if (allowX && allowY) {
                        var prepareX = [],
                            newPageIndex = undefined;
                        var nowXY = {
                            left: scrollLeft,
                            top: scrollTop
                        };
                        S.each(pagesOffset, function (offset) {
                            if (!offset) {
                                return;
                            }
                            if (offsetX > 0 && offset.left > nowXY.left) {
                                prepareX.push(offset);
                            } else if (offsetX < 0 && offset.left < nowXY.left) {
                                prepareX.push(offset);
                            }
                        });
                        var min;
                        if (offsetY > 0) {
                            min = Number.MAX_VALUE;
                            S.each(prepareX, function (x) {
                                if (x.top > nowXY.top) {
                                    if (min < x.top - nowXY.top) {
                                        min = x.top - nowXY.top;
                                        newPageIndex = prepareX.index;
                                    }
                                }
                            });
                        } else {
                            min = Number.MAX_VALUE;
                            S.each(prepareX, function (x) {
                                if (x.top < nowXY.top) {
                                    if (min < nowXY.top - x.top) {
                                        min = nowXY.top - x.top;
                                        newPageIndex = prepareX.index;
                                    }
                                }
                            });
                        }
                        if (newPageIndex != undefined) {
                            if (newPageIndex != pageIndex) {
                                self.scrollToPage(newPageIndex, animCfg);
                            } else {
                                self.scrollToPage(newPageIndex);
                                scrollEnd();
                            }
                        } else {
                            scrollEnd();
                        }
                    } else {
                        if (allowX || allowY) {
                            var toPageIndex = self._getPageIndexFromXY(
                                allowX ? scrollLeft : scrollTop, allowX,
                                allowX ? offsetX : offsetY);
                            self.scrollToPage(toPageIndex, animCfg);
                        } else {
                            self.scrollToPage(self.get('pageIndex'));
                            scrollEnd();
                        }
                    }
                }
            }
        }

        onDragEndAxis(self, e, 'left', endCallback);
        onDragEndAxis(self, e, 'top', endCallback);
    }

    function initStates(self) {
        self.lastPageXY = {};
        self.lastDirection = {};
        self.swipe = {
            left: {},
            top: {}
        };
        self.startMousePos = null;
        self.startScroll = {};
        self.dragInitDirection = null;
    }

    function preventDefault(e) {
        e.preventDefault();
    }

    /**
     * allow touch drag for scroll view
     * @class KISSY.ScrollView.Drag
     */
    return ScrollViewBase.extend({
            bindUI: function () {
                var self = this;
                self.$contentEl.on('dragstart', preventDefault)
                    .on(Gesture.start, onDragStartHandler, self);
            },

            syncUI: function () {
                initStates(this);
            },

            destructor: function () {
                this.stopAnimation();
            },

            stopAnimation: function () {
                this.callSuper();
                this.isScrolling = 0;
            }
        }, {
            ATTRS: {
                /**
                 * whether allow drag in x direction when content size is less than container size.
                 * Defaults to: true, does not allow.
                 * @cfg {Boolean} lockX
                 */
                /**
                 * @ignore
                 */
                lockX: {
                    value: true
                },
                /**
                 * whether allow drag in y direction when content size is less than container size.
                 * Defaults to: false, allow.
                 * @cfg {Boolean} lockY
                 */
                /**
                 * @ignore
                 */
                lockY: {
                    value: false
                },
                /**
                 * px diff to start x or y snap gesture
                 * Defaults to: 5.
                 * @cfg {Boolean} snapThreshold
                 */
                /**
                 * @ignore
                 */
                snapThreshold: {
                    value: 5
                },
                /**
                 * whether allow bounce effect
                 * Defaults to: true.
                 * @cfg {Boolean} bounce
                 */
                /**
                 * @ignore
                 */
                bounce: {
                    value: true
                },
                /**
                 * bounce effect duration.
                 * Defaults to: 0.4.
                 * @cfg {Number} bounceDuration
                 */
                /**
                 * @ignore
                 */
                bounceDuration: {
                    value: 0.4
                },
                /**
                 * bounce easing config.
                 * Defaults to: easeOut.
                 * @cfg {Boolean} bounceEasing
                 */
                /**
                 * @ignore
                 */
                bounceEasing: {
                    value: 'easeOut'
                }
            },
            xclass: 'scroll-view'
        }
    );
}, {
    requires: ['./base', 'node', 'anim']
});
/**
 * @ignore
 * refer
 * - https://developers.google.com/mobile/articles/webapp_fixed_ui
 * - http://yuilibrary.com/yui/docs/scroll-view/
 * - http://docs.sencha.com/touch/2-1/#!/api/Ext.dataview.List
 * - http://cubiq.org/iscroll-4
 * - http://developer.apple.com/library/ios/#documentation/uikit/reference/UIScrollView_Class/Reference/UIScrollView.html
 */