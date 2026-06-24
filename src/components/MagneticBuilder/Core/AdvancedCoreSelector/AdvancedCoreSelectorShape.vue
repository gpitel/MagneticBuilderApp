<script setup>
import DimensionReadOnly from '/WebSharedComponents/DataInput/DimensionReadOnly.vue'
import Dimension from '/WebSharedComponents/DataInput/Dimension.vue'
import ElementFromList from '/WebSharedComponents/DataInput/ElementFromList.vue'
import { useHistoryStore } from '../../../../stores/history'
import { deepCopy, isMobile } from '/WebSharedComponents/assets/js/utils.js'
import Core3DVisualizer from '/WebSharedComponents/Common/Core3DVisualizer.vue'
import Core2DVisualizer from '/WebSharedComponents/Common/Core2DVisualizer.vue'
import Dialog from 'primevue/dialog'
import Text from '/WebSharedComponents/DataInput/Text.vue'
import ContextMenu from '../../ContextMenu.vue'
import { useMagneticBuilderSettingsStore } from '../../../../stores/magneticBuilderSettings'
import { useTaskQueueStore } from '../../../../stores/taskQueue'

</script>

<script>

export default {
    emits: ["errorInDimensions", "renderSuccess"],
    props: {
        dataTestLabel: {
            type: String,
            default: '',
        },
        core: {
            type: Object,
            required: true,
        },
        enableSimulation: {
            type: Boolean,
            default: true,
        },
        allowFamilyChange: {
            type: Boolean,
            default: false,
        },
    },
    data() {
        const taskQueueStore = useTaskQueueStore();
        const localData = {};
        const localCoreToDraw = deepCopy(this.core);
        const errorMessages = {};
        const loading = false;
        const imageUpToDate = true;
        const dataUptoDate = true;
        const availableFamilies = {};
        const availableFamilySubtypes = [];
        const dimensionsExceptionsPerFamily = {
            "ec": ["r"],
            "pq": ["J", "L"],
            "p": ["M", "N", "r1"],
            "planarEL": ["R"],
            "pm": ["e"],
            "pq": ["J", "L"],
            "rm": ["R"],
            "u": ["R1", "R2"],
        }
        const magneticBuilderSettingsStore = useMagneticBuilderSettingsStore();

        if (this.core.functionalDescription.shape && typeof this.core.functionalDescription.shape === 'object' && this.core.functionalDescription.shape.name) {
            this.core.functionalDescription.shape.name = this.core.functionalDescription.shape.name.startsWith("Custom")? this.core.functionalDescription.shape.name : "Custom " + this.core.functionalDescription.shape.name;
        }

        const subscriptions = []
        const forceUpdate = 0;
        return {
            taskQueueStore,
            localData,
            localCoreToDraw,
            imageUpToDate,
            dataUptoDate,
            errorMessages,
            loading,
            availableFamilies,
            availableFamilySubtypes,
            dimensionsExceptionsPerFamily,
            magneticBuilderSettingsStore,
            subscriptions,
            forceUpdate,
            // 3D model: show the whole core (false) or a single piece — half a
            // two-piece concentric core; toroids stay whole (true).
            showOnePieceOnly: false,
            // Technical Drawing: enlarge in a modal when clicked.
            showTechnicalDrawingModal: false,
            // Zoom/pan state for the enlarged Technical Drawing (scroll to zoom,
            // drag to pan). transform-origin is the viewport's top-left (0,0).
            drawingZoom: { scale: 1, x: 0, y: 0 },
            drawingPan: { active: false, startX: 0, startY: 0, origX: 0, origY: 0 },
        }
    },
    computed: {
        // Toroids are a single continuous piece, so the one-piece toggle is
        // meaningless for them — used to hide it.
        isToroidalShape() {
            const fam = (this.core?.functionalDescription?.shape?.family
                ?? this.localData?.family ?? '').toString().toLowerCase();
            return fam === 't' || fam === 'toroidal';
        },
    },
    watch: {
    },
    created () {
    },
    mounted () {
        this.subscriptions.push(this.$stateStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "redraw") {
                    this.redraw();
                }
            });
        }))

        this.subscriptions.push(this.taskQueueStore.$onAction(({name, args, after}) => {
            after(() => {
                if (name == "coreShapeFamiliesGotten") {
                    if (args[0]) {
                        const coreShapeFamilies = args[1];
                        coreShapeFamilies.forEach((shapeFamily) => {
                            this.availableFamilies[shapeFamily] = shapeFamily.toUpperCase();
                        })
                        this.getFamilySubtypes();
                    }
                    else {
                        console.error(args[1])
                    }
                }
                if (name == "coreShapeFamilySubtypesGotten") {
                    if (args[0]) {
                        this.availableFamilySubtypes = args[1];
                        if (this.availableFamilySubtypes.length == 0) {
                            this.localData.familySubtype = null;
                        }
                        else if (!(this.localData.familySubtype in this.availableFamilySubtypes)) {
                            this.localData.familySubtype = this.availableFamilySubtypes[0];
                        }

                        this.getDimensionKeys();
                    }
                    else {
                        console.error(args[1])
                    }
                }
                if (name == "coreShapeFamilyDimensionsGotten") {
                    if (args[0]) {
                        const dimensions = deepCopy(args[1]);
                        this.localData.dimensions = deepCopy(dimensions);
                    }
                    else {
                        console.error(args[1])
                    }
                }
                if (name == "coreProcessed") {
                    if (args[0]) {
                        const core = args[1];

                        this.core.processedDescription = core.processedDescription;
                        this.dataUptoDate = true;

                    }
                    else {
                        console.error(args[1]);
                    }
                }
                if (name == "dimensionWithToleranceResolved") {
                    if (args[0]) {
                        const core = args[1];

                        this.core.processedDescription = core.processedDescription;
                        this.dataUptoDate = true;

                    }
                    else {
                        console.error(args[1]);
                    }
                }
            });
        }))
        this.getFamilies();
        if (this.core.functionalDescription.shape && typeof this.core.functionalDescription.shape === 'object') {
            this.assignLocalData(this.core.functionalDescription.shape);
            this.getDimensionKeys();
        }
        // Populate the effective parameters (L_eff / A_eff / V_eff / A_min) on
        // entry so the Core Info block shows immediately, instead of only after
        // the user's first dimension edit triggers a re-process.
        this.calculateCoreEffectiveParameters();
    },
    beforeUnmount () {
        this.subscriptions.forEach((subscription) => {subscription();})
    },
    methods: {
        computeErrorMessages() {
            this.errorMessages = {}
            Object.keys(this.localData.dimensions).forEach((key) => {
                if (this.localData.dimensions[key] == null) {
                    if (key == 'G' || key == 'H') {
                        this.localData.dimensions[key] = 0;
                    }
                    else {
                        this.errorMessages[key] = key + ' cannot be empty';
                    }
                }
                else if (this.localData.dimensions[key] == 0) {
                    if ((key != 'H' || this.localData.family == 'ur') &&
                        (key != 'G') &&
                        (key == 'C' && this.localData.family != 'p')) {
                        this.errorMessages[key] = key + ' must be greater than 0';
                    }
                }
                else {
                    if (key == 'B'){
                        if (this.localData.dimensions['D'] >= this.localData.dimensions['B']){
                            this.errorMessages[key] = 'B must be greater than D';
                        }
                    }
                    else if (key == 'D'){
                        if (this.localData.dimensions['D'] >= this.localData.dimensions['B']){
                            this.errorMessages[key] = 'D must be smaller than B';
                        }
                    }

                    if (key == 'A'){
                        if (this.localData.dimensions['E'] >= this.localData.dimensions['A']){
                            this.errorMessages[key] = 'A must be greater than E';
                        }
                    }
                    else if (key == 'E'){
                        if (this.localData.dimensions['E'] >= this.localData.dimensions['A']){
                            this.errorMessages[key] = 'E must be smaller than A';
                        }
                    }

                    if (!(this.localData.family == "ur")) {
                        if (key == 'E'){
                            if (this.localData.dimensions['F'] >= this.localData.dimensions['E']){
                                this.errorMessages[key] = 'E must be greater than F';
                            }
                        }
                        else if (key == 'F'){
                            if (this.localData.dimensions['F'] >= this.localData.dimensions['E']){
                                this.errorMessages[key] = 'F must be smaller than E';
                            }
                        }
                    }

                    if (key == 'E'){
                        if (this.localData.dimensions['G'] > this.localData.dimensions['E']){
                            this.errorMessages[key] = 'E must be greater than G';
                        }
                    }
                    else if (key == 'G'){
                        if (this.localData.dimensions['G'] > this.localData.dimensions['E']){
                            this.errorMessages[key] = 'G must be smaller than E';
                        }
                    }

                    if (this.localData.family == "er") {
                        if (this.localData.dimensions['G'] > 0) {
                            if (key == 'F'){
                                if (this.localData.dimensions['G'] < this.localData.dimensions['F']){
                                    this.errorMessages[key] = 'F must be smaller than G';
                                }
                            }
                            else if (key == 'G'){
                                if (this.localData.dimensions['G'] < this.localData.dimensions['F']){
                                    this.errorMessages[key] = 'G must be greater than F';
                                }
                            }
                        }
                    }

                    if (!(this.localData.family == "rm" && this.localData.familySubtype == "2") && !(this.localData.family == "p" && this.localData.familySubtype != "2") && !(this.localData.family == "efd") && !(this.localData.family == "planarER") && !(this.localData.family == "ut") && this.localData.dimensions['C'] > 0) {
                        let c_f_condition = false;
                        if (this.localData.family != "e") {
                            if (this.localData.family != "er" && this.localData.family != "etd" && this.localData.family != "ec") {
                                c_f_condition = this.localData.dimensions['F'] >= this.localData.dimensions['C'];
                            }
                            else {
                                c_f_condition = this.localData.dimensions['F'] > this.localData.dimensions['C'];
                            }
                        }
                        if (key == 'C'){
                            if (c_f_condition){
                                this.errorMessages[key] = 'C must be greater than F';
                            }
                        }
                        else if (key == 'F'){
                            if (c_f_condition){
                                this.errorMessages[key] = 'F must be smaller than C';
                            }
                        }
                    }

                    if (key == 'J'){
                        if (this.localData.dimensions['E'] > this.localData.dimensions['J']){
                            this.errorMessages[key] = 'J must be greater than E';
                        }
                    }
                    else if (key == 'E'){
                        if (this.localData.dimensions['E'] > this.localData.dimensions['J']){
                            this.errorMessages[key] = 'E must be smaller than J';
                        }
                    }
                    if (this.localData.family !== "efd" && this.localData.family !== "epx") {
                        if (key == 'K'){
                            if (this.localData.dimensions['F'] / 2 > this.localData.dimensions['K']){
                                this.errorMessages[key] = 'K must be greater than F/2';
                            }
                            else if (this.localData.dimensions['F'] / 2 + this.localData.dimensions['K'] > this.localData.dimensions['C'] ){
                                this.errorMessages[key] = 'C must be greater than F/2 + K';
                            }
                        }
                    }
                }
            })
        },
        assignLocalData(shape) {
            const localData = {
                family: shape.family,
                familySubtype: shape.familySubtype,
                dimensions: {},
            };

            Object.keys(shape.dimensions ?? {}).forEach((key) => {
                this.taskQueueStore.resolveDimensionWithTolerance(shape.dimensions[key]).then((response) => {
                    localData.dimensions[key] = response
                });
            })

            this.localData = localData;
        },
        getFamilies() {
            this.taskQueueStore.getCoreShapeFamilies();
        },
        getFamilySubtypes() {
            if (this.localData != null && this.localData.family != null) {
                this.taskQueueStore.getCoreShapeFamilySubtype(this.localData.family);
            }
        },
        getDimensionKeys() {
            if (this.localData != null && this.localData.family != null && this.localData.familySubtype != null) {
                this.taskQueueStore.getCoreShapeFamilyDimensions(this.localData.family, this.localData.familySubtype, this.dimensionsExceptionsPerFamily, this.localData.dimensions);
            }
        },
        familyUpdated() {
            this.imageUpToDate = false;
            this.dataUptoDate = false;
            this.core.functionalDescription.shape.family = deepCopy(this.localData.family);
            this.getFamilySubtypes();

            if (this.$settingsStore.magneticBuilderSettings.autoRedraw) {
                this.redraw();
            }
        },
        familySubtypeUpdated() {
            this.imageUpToDate = false;
            this.dataUptoDate = false;
            this.core.functionalDescription.shape.familySubtype = deepCopy(this.localData.familySubtype);
            this.getDimensionKeys();

            if (this.$settingsStore.magneticBuilderSettings.autoRedraw) {
                this.redraw();
            }
        },
        dimensionUpdated() {
            this.imageUpToDate = false;
            this.dataUptoDate = false;
            this.core.functionalDescription.shape.dimensions = {};
            Object.keys(this.localData.dimensions).forEach((key) => {
                this.core.functionalDescription.shape.dimensions[key] = {};
                this.core.functionalDescription.shape.dimensions[key]["nominal"] = this.localData.dimensions[key];
            })

            this.calculateCoreEffectiveParameters();
            this.computeErrorMessages();

            if (this.$settingsStore.magneticBuilderSettings.autoRedraw) {
                this.redraw();
            }
        },
        redraw() {
            this.errorMessage = "";
            this.localCoreToDraw.functionalDescription.shape.dimensions = deepCopy(this.localData.dimensions);
            this.localCoreToDraw.functionalDescription.shape.family = deepCopy(this.localData.family);
            this.localCoreToDraw.functionalDescription.shape.familySubtype = deepCopy(this.localData.familySubtype);
            this.forceUpdate += 1;
            this.imageUpToDate = true;
        },
        calculateCoreEffectiveParameters() {
            if (this.core['functionalDescription']['shape'] != "") {
                this.taskQueueStore.processCore(this.core);
            }
        },
        // ── Technical Drawing zoom/pan ──────────────────────────────────────
        clampDrawingScale(s) {
            return Math.min(8, Math.max(0.5, s));
        },
        // Zoom toward a point (px,py relative to the viewport's top-left), keeping
        // the content under that point fixed. transform-origin is 0,0.
        zoomDrawingAt(factor, px, py) {
            const next = this.clampDrawingScale(this.drawingZoom.scale * factor);
            const ratio = next / this.drawingZoom.scale;
            this.drawingZoom.x = px - (px - this.drawingZoom.x) * ratio;
            this.drawingZoom.y = py - (py - this.drawingZoom.y) * ratio;
            this.drawingZoom.scale = next;
        },
        onDrawingWheel(e) {
            const rect = this.$refs.drawingViewport?.getBoundingClientRect();
            if (!rect) return;
            const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
            this.zoomDrawingAt(factor, e.clientX - rect.left, e.clientY - rect.top);
        },
        zoomDrawing(factor) {
            const rect = this.$refs.drawingViewport?.getBoundingClientRect();
            this.zoomDrawingAt(factor, rect ? rect.width / 2 : 0, rect ? rect.height / 2 : 0);
        },
        resetDrawingZoom() {
            this.drawingZoom = { scale: 1, x: 0, y: 0 };
            this.drawingPan.active = false;
        },
        startDrawingPan(e) {
            this.drawingPan = {
                active: true, startX: e.clientX, startY: e.clientY,
                origX: this.drawingZoom.x, origY: this.drawingZoom.y,
            };
        },
        onDrawingPan(e) {
            if (!this.drawingPan.active) return;
            this.drawingZoom.x = this.drawingPan.origX + (e.clientX - this.drawingPan.startX);
            this.drawingZoom.y = this.drawingPan.origY + (e.clientY - this.drawingPan.startY);
        },
        endDrawingPan() {
            this.drawingPan.active = false;
        },
    }
}
</script>

<template>
    <div class="container">
        <div class="row">
            <h2 
                class="col-4 mb-3 text-center"
                >
                {{'Core Shape Customizer'}}
            </h2>
            <div 
                v-if="magneticBuilderSettingsStore.enableContextMenu"
                class="col-8 border mt-2" style="height: fit-content" :style="$styleStore.contextMenu.main">
                <ContextMenu
                    v-if="magneticBuilderSettingsStore.enableContextMenu"
                    :dataTestLabel="dataTestLabel + '-ContextMenu'"
                />
            </div>
        </div>
        <div
            v-if="'dimensions' in localData"
            class="row"
        >
            <div class="md:col-3 sm:col-12">
                <h3 class= "mb-3"> {{'Dimensions'}} </h3>
                <ElementFromList
                    v-if="allowFamilyChange"
                    class="col-10 col-offset-1 mb-1 text-left"
                    :dataTestLabel="dataTestLabel + '-ShapeFamilies'"
                    :name="'family'"
                    :titleSameRow="true"
                    :justifyContent="true"
                    v-model="localData"
                    :options="availableFamilies"
                    :labelWidthProportionClass="'col-12 md:col-5'"
                    :valueWidthProportionClass="'col-12 md:col-7'"
                    :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                    :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                    :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                    :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                    :textColor="$styleStore.magneticBuilder.inputTextColor"
                    @update="familyUpdated"
                />
                <Text
                    class="col-10 col-offset-1 mb-1 text-left name-field-stacked"
                    :name="'name'"
                    v-model="core.functionalDescription.shape"
                    :defaultValue="'Shape name'"
                    :dataTestLabel="dataTestLabel + '-ShapeName'"
                    :canBeEmpty="false"
                    :labelWidthProportionClass="'col-12'"
                    :valueWidthProportionClass="'col-12'"
                    :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                    :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                    :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                    :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                    :textColor="$styleStore.magneticBuilder.inputTextColor"
                />
                <ElementFromList
                    v-if="availableFamilySubtypes.length > 0"
                    class="col-10 col-offset-1 mb-1 text-left"
                    :dataTestLabel="dataTestLabel + '-ShapeFamilySubtypes'"
                    :name="'familySubtype'"
                    :replaceTitle="'Subtype'"
                    :titleSameRow="true"
                    :justifyContent="true"
                    v-model="localData"
                    :options="availableFamilySubtypes"
                    :labelWidthProportionClass="'col-12 md:col-5'"
                    :valueWidthProportionClass="'col-12 md:col-7'"
                    :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                    :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                    :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                    :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                    :textColor="$styleStore.magneticBuilder.inputTextColor"
                    @update="familySubtypeUpdated"
                />
                <div
                    v-for="key in Object.keys(localData.dimensions)"
                    class="col-10 col-offset-1 mb-1 text-left"
                >
                    <Dimension 
                        :name="key"
                        :replaceTitle="key"
                        :unit="key =='alpha'? '°' : 'm'"
                        :dataTestLabel="dataTestLabel + '-Dimension-' + key"
                        :justifyContent="true"
                        :allowNegative="key == 'K' && localData.family == 'efd'"
                        :allowZero="true"
                        :min="key =='alpha'? 1 : 0.000001"
                        :max="key =='alpha'? 360: 1"
                        :modelValue="localData.dimensions"
                        :labelWidthProportionClass="'col-4'"
                        :valueWidthProportionClass="'col-8'"
                        :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                        :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                        :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                        :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                        :textColor="$styleStore.magneticBuilder.inputTextColor"
                        @update="dimensionUpdated"
                    />
                    <label
                        v-if="key in errorMessages && errorMessages[key] != ''"
                        class="text-danger"
                        style="font-size: 1em"
                    >
                        {{errorMessages[key]}}
                    </label>
                </div>

                <div class=" mt-5 mb-3 pb-3 border-bottom border-top pt-2 text-left" :style="$styleStore.magneticBuilder.main">
                    <div
                        v-if="core.processedDescription != null"
                        class="row core-info-block"
                        :style="[{ '--core-info-label-font-size': $styleStore.magneticBuilder.inputTitleFontSize?.['font-size'] ?? $styleStore.magneticBuilder.inputTitleFontSize?.fontSize }, { opacity: dataUptoDate ? '100%' : '20%' }]"
                    >
                        <DimensionReadOnly 
                            class="col-12 pr-4 pl-5"
                            :name="'L'"
                            :subscriptName="'eff'"
                            :unit="'m'"
                            :power="1"
                            :dataTestLabel="dataTestLabel + '-EffectiveLength'"
                            :numberDecimals="2"
                            :value="core.processedDescription.effectiveParameters.effectiveLength"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                        <DimensionReadOnly 
                            class="col-12 pr-4 pl-5"
                            :name="'A'"
                            :subscriptName="'eff'"
                            :unit="'m²'"
                            :power="2"
                            :dataTestLabel="dataTestLabel + '-EffectiveArea'"
                            :numberDecimals="1"
                            :value="core.processedDescription.effectiveParameters.effectiveArea"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                        <DimensionReadOnly 
                            class="col-12 pr-4 pl-5"
                            :name="'V'"
                            :subscriptName="'eff'"
                            :unit="'m³'"
                            :power="3"
                            :dataTestLabel="dataTestLabel + '-EffectiveVolume'"
                            :numberDecimals="1"
                            :value="core.processedDescription.effectiveParameters.effectiveVolume"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                        <DimensionReadOnly
                            class="col-12 pr-4 pl-5"
                            :name="'A'"
                            :subscriptName="'min'"
                            :unit="'m²'"
                            :power="2"
                            :dataTestLabel="dataTestLabel + '-MinimumArea'"
                            :numberDecimals="1"
                            :value="core.processedDescription.effectiveParameters.minimumArea"
                            :disableShortenLabels="true"
                            :labelWidthProportionClass="'col-3'"
                            :valueWidthProportionClass="'col-9'"
                            :valueFontSize="$styleStore.magneticBuilder.inputFontSize"
                            :labelFontSize="$styleStore.magneticBuilder.inputTitleFontSize"
                            :labelBgColor="$styleStore.magneticBuilder.inputLabelBgColor"
                            :valueBgColor="$styleStore.magneticBuilder.inputValueBgColor"
                            :textColor="$styleStore.magneticBuilder.inputTextColor"
                        />
                    </div>
                </div>

            </div>
            <div class="md:col-5 sm:col-12">
                <h3 class= "mb-3"> {{'3D model'}} </h3>
                <div
                    v-if="core.functionalDescription != null"
                    class="row"
                    style="height: 50vh"
                    :style="imageUpToDate? 'opacity: 100%;' : 'opacity: 20%;'"
                >
                    <Core3DVisualizer
                        :dataTestLabel="`${dataTestLabel}-Core3DVisualizer`"
                        :core="localCoreToDraw"
                        :forceUpdate="forceUpdate"
                        :fullCoreModel="!showOnePieceOnly"
                        :ignoreStacks="true"
                        :loadingGif="$settingsStore.loadingGif"
                        :backgroundColor="$styleStore.magneticBuilder.main['background-color']"
                        @errorInDimensions="$emit('errorInDimensions')"
                        @renderSuccess="$emit('renderSuccess')"
                    />
                </div>
                <div v-if="core.functionalDescription != null && !isToroidalShape" class="form-check form-switch mt-2 ml-2">
                    <input
                        :id="`${dataTestLabel}-ShowOnePieceOnly`"
                        :data-cy="`${dataTestLabel}-ShowOnePieceOnly`"
                        class="form-check-input custom-switch"
                        type="checkbox"
                        role="switch"
                        v-model="showOnePieceOnly"
                    />
                    <label class="form-check-label ml-2" :for="`${dataTestLabel}-ShowOnePieceOnly`">
                        {{ 'Show one piece only' }}
                    </label>
                </div>
            </div>
            <div class="md:col-4 sm:col-12">
                <h3 class= "mb-3"> {{'Technical Drawing'}} </h3>
                <div
                    v-if="core.functionalDescription != null"
                    class="row tech-drawing-clickable"
                    :style="imageUpToDate? 'opacity: 100%;' : 'opacity: 20%;'"
                    title="Click to enlarge"
                    @click="showTechnicalDrawingModal = true"
                >
                    <Core2DVisualizer
                        :dataTestLabel="`${dataTestLabel}-Core2DVisualizer`"
                        :core="localCoreToDraw"
                        :forceUpdate="forceUpdate"
                        :ignoreStacks="true"
                        :loadingGif="$settingsStore.loadingGif"
                        :backgroundColor="$styleStore.magneticBuilder.main['background-color']"
                        @errorInDimensions="$emit('errorInDimensions')"
                        @renderSuccess="$emit('renderSuccess')"
                    />
                </div>
            </div>
        </div>
    </div>

    <Dialog
        :visible="showTechnicalDrawingModal"
        @update:visible="(v) => { showTechnicalDrawingModal = v; if (!v) resetDrawingZoom(); }"
        :modal="true"
        :draggable="false"
        :dismissableMask="true"
        :style="{ width: '95vw', height: '92vh' }"
        :pt="{ root: { class: 'tech-drawing-modal-content' } }"
    >
        <template #header>
            <div class="tech-drawing-modal-header">
                <i class="pi pi-image shape-header-icon mr-2"></i>
                <h5 class="modal-title mb-0 shape-modal-title">Technical Drawing</h5>
                <div class="tech-drawing-tools">
                    <button type="button" class="tech-drawing-tool-btn" title="Zoom out"
                        :data-cy="dataTestLabel + '-TechDrawing-ZoomOut'" @click="zoomDrawing(1 / 1.3)">
                        <i class="pi pi-search-minus"></i>
                    </button>
                    <span class="tech-drawing-zoom-label">{{ Math.round(drawingZoom.scale * 100) }}%</span>
                    <button type="button" class="tech-drawing-tool-btn" title="Zoom in"
                        :data-cy="dataTestLabel + '-TechDrawing-ZoomIn'" @click="zoomDrawing(1.3)">
                        <i class="pi pi-search-plus"></i>
                    </button>
                    <button type="button" class="tech-drawing-tool-btn" title="Reset zoom"
                        :data-cy="dataTestLabel + '-TechDrawing-ZoomReset'" @click="resetDrawingZoom">
                        <i class="pi pi-refresh"></i>
                    </button>
                </div>
            </div>
        </template>
        <div
            v-if="core.functionalDescription != null"
            ref="drawingViewport"
            class="tech-drawing-zoom-viewport"
            :class="{ panning: drawingPan.active }"
            title="Scroll to zoom · drag to pan"
            @wheel.prevent="onDrawingWheel"
            @mousedown.prevent="startDrawingPan"
            @mousemove="onDrawingPan"
            @mouseup="endDrawingPan"
            @mouseleave="endDrawingPan"
        >
            <div
                class="tech-drawing-zoom-inner"
                :style="{ transform: `translate(${drawingZoom.x}px, ${drawingZoom.y}px) scale(${drawingZoom.scale})` }"
            >
                <Core2DVisualizer
                    :dataTestLabel="`${dataTestLabel}-Core2DVisualizer-Modal`"
                    :core="localCoreToDraw"
                    :forceUpdate="forceUpdate"
                    :ignoreStacks="true"
                    :loadingGif="$settingsStore.loadingGif"
                    :backgroundColor="$styleStore.magneticBuilder.main['background-color']"
                />
            </div>
        </div>
    </Dialog>
</template>

<style scoped>
/* Name field: stack the label and the value input on two rows instead of
 * side-by-side (the shared Text component's .text-input-row is flex-nowrap,
 * so col-12 + col-12 alone won't wrap). */
.name-field-stacked :deep(.text-input-row) {
    flex-direction: column;
    align-items: stretch;
}

/* Core Info (L_eff / A_eff / V_eff / A_min): match the core-config sizing —
 * labels 1.15rem, values 1rem. DimensionReadOnly styles its label inline with
 * valueFontSize (=1rem here), so bump just the label via a token-fed CSS var
 * (set on .core-info-block from inputTitleFontSize); !important beats the
 * component's inline style. */
.core-info-block :deep(.dim-ro-label) {
    font-size: var(--core-info-label-font-size, 1.15rem) !important;
}
/* Tighten the vertical spacing between the L_eff / A_eff / V_eff / A_min rows. */
.core-info-block :deep(.dim-ro-container) {
    padding-top: 0.1rem !important;
    padding-bottom: 0.1rem !important;
}

/* Inline Technical Drawing: clickable to enlarge, and never taller than 60% of
 * the viewport — two stacked views (front + top) each capped at ~30vh and
 * scaled down proportionally (viewBox preserves aspect ratio). */
.tech-drawing-clickable {
    cursor: pointer;
}
.tech-drawing-clickable :deep(.Core2DVisualizer svg) {
    max-height: 30vh;
    height: auto;
    width: auto;
    max-width: 100%;
    display: block;
    margin: 0 auto;
}
</style>

<!-- Non-scoped: the PrimeVue Dialog teleports to <body>, so scoped styles can't
     reach it. Size the enlarged Technical Drawing to fill the modal. -->
<style>
.tech-drawing-modal-content {
    background-color: var(--p-dark);
    border: 1px solid var(--p-secondary);
    border-radius: 0.75rem;
    display: flex;
    flex-direction: column;
}
/* Let the drawing area fill the (now near-full-screen) dialog. */
.tech-drawing-modal-content .p-dialog-content {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    padding: 0;
}
.tech-drawing-modal-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
}
.tech-drawing-tools {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-left: auto;
}
.tech-drawing-tool-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 0.4rem;
    border: 1px solid var(--p-secondary);
    background: var(--p-gray-800, #1f1f1f);
    color: var(--p-gray-100, #e5e5e5);
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
}
.tech-drawing-tool-btn:hover {
    background: var(--p-primary);
    border-color: var(--p-primary);
    color: var(--p-white, #fff);
}
.tech-drawing-zoom-label {
    min-width: 3.25rem;
    text-align: center;
    font-size: 0.85rem;
    color: var(--p-gray-300, #bbb);
    user-select: none;
}
/* Pan/zoom viewport: clips the scaled drawing; the inner wrapper carries the
   transform (scroll to zoom toward the cursor, drag to pan). */
.tech-drawing-zoom-viewport {
    width: 100%;
    height: 100%;
    overflow: hidden;
    cursor: grab;
    background: var(--p-dark);
}
.tech-drawing-zoom-viewport.panning {
    cursor: grabbing;
}
.tech-drawing-zoom-inner {
    transform-origin: 0 0;
    width: 100%;
    will-change: transform;
}
/* Base size of the two stacked views at 100% — fills most of the tall modal. */
.tech-drawing-zoom-inner svg {
    height: auto;
    width: auto;
    max-width: 100%;
    max-height: 42vh;
    display: block;
    margin: 0 auto;
}
</style>
