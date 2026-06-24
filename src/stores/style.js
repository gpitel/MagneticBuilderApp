import { defineStore } from 'pinia'
import { ref, watch, computed  } from 'vue'

export const useStyleStore = defineStore("style", () => {
    const style = getComputedStyle(document.body);

    const theme = {
        primary: style.getPropertyValue('--p-primary'),
        secondary: style.getPropertyValue('--p-secondary'),
        success: style.getPropertyValue('--p-success'),
        info: style.getPropertyValue('--p-info'),
        warning: style.getPropertyValue('--p-warning'),
        danger: style.getPropertyValue('--p-danger'),
        light: style.getPropertyValue('--p-light'),
        dark: style.getPropertyValue('--p-dark'),
        white: style.getPropertyValue('--p-white'),
        transparent: style.getPropertyValue('--p-transparent'),
    };

    const engineLoader = ref({
        main: {
            "background": theme["dark"] + ' !important',
            "color": theme["white"],
        },
    });

    const storyline = ref({
        main: {
            "background": "transparent",
            "color": theme["white"],
        },
        activeButton: {
            "background": theme["primary"],
            "color": theme["dark"],
        },
        availableButton: {
            "background": theme["secondary"],
            "color": theme["white"],
        },
        pendingButton: {
            "background": "transparent",
            "color": theme["white"],
        },
        continueButton: {
            "background": theme["success"],
            "color": theme["dark"],
        }
    });


    const designRequirements = ref({
        main: {
            "background": theme["dark"],
            "color": theme["white"],
            "border-color": theme["primary"],
        },
        requiredButton: {
            "background": theme["light"],
            "color": theme["white"],
            "border-color": theme["light"],
        },
        addButton: {
            "background": theme["info"],
            "color": theme["dark"],
        },
        removeButton: {
            "background": theme["danger"],
            "color": theme["dark"],
        },
        requirementButton: {
            "background": theme["primary"],
            "color": theme["dark"],
            "border-color": theme["primary"],
        },
        inputFontSize: {
            // "font-size": '2rem',
            "font-size": '1rem',
        },
        inputTitleFontSize: {
            // "font-size": '2.5rem',
            "font-size": '1.25rem',
        },
        inputLabelBgColor:{
            "background": theme["dark"],
        },
        inputValueBgColor:{
            "background": theme["light"],
        },
        inputTextColor:{
            "color": theme["white"],
        },
        addElementButtonColor: {
            "color": theme["secondary"],
        },
        removeElementButtonColor: {
            "color": theme["danger"],
        },
    });


    const operatingPoints = ref({
        main: {
            "background": theme["dark"],
            "color": theme["white"],
            "border-color": theme["primary"],
        },
        unselectedUnprocessedWindingButton: {
            "background": theme["danger"],
            "color": theme["dark"],
        },
        unselectedProcessedWindingButton: {
            "background": theme["danger"],
            "color": theme["dark"],
        },
        selectedWindingButton: {
            "background": theme["success"],
            "color": theme["dark"],
        },
        reflectWindingButton: {
            "background": theme["secondary"],
            "color": theme["white"],
        },
        addOperatingPointButton: {
            "background": theme["secondary"],
            "color": theme["white"],
        },
        selectOperatingPointButton: {
            "background": theme["primary"],
            "color": theme["dark"],
        },
        removeOperatingPointButton: {
            "background": theme["danger"],
            "color": theme["dark"],
        },
        modifyNumberWindingsButton: {
            "background": theme["secondary"],
            "color": theme["white"],
        },
        goBackSelectingButton: {
            "background": theme["success"],
            "border-color": theme["success"],
            "color": theme["dark"],
        },
        confirmColumnsButton: {
            "background": theme["success"],
            "border-color": theme["success"],
            "color": theme["dark"],
        },
        typeButton: {
            "background": theme["secondary"],
            "border-color": theme["secondary"],
            "color": theme["white"],
            "font-size": '1.25rem',
        },

        titleLabelBgColor:{
            "background": theme["dark"],
        },
        titleTextColor:{
            "color": theme["white"],
        },
        commonParameterTextColor:{
            "color": theme["white"],
        },
        commonParameterBgColor:{
            "color": theme["white"],
        },
        currentTextColor:{
            "color": theme["info"],
        },
        voltageTextColor:{
            "color": theme["primary"],
        },
        currentBgColor:{
            "background": theme["info"],
        },
        voltageBgColor:{
            "background": theme["primary"],
        },


        inputFontSize: {
            // "font-size": '2rem',
            "font-size": '1rem',
        },
        inputTitleFontSize: {
            // "font-size": '2.5rem',
            "font-size": '1.25rem',
        },
        inputLabelBgColor:{
            "background": theme["dark"],
        },
        inputValueBgColor:{
            "background": theme["light"],
        },
        inputTextColor:{
            "color": theme["white"],
        },
        addElementButtonColor: {
            "color": theme["secondary"],
        },
        removeElementButtonColor: {
            "color": theme["danger"],
        },

    });

    const magneticBuilder = ref({
        main: {
            "background-color": theme["dark"],
            "color": theme["white"],
            "border-color":  theme["primary"] + ' !important',
        },
        exporter: {
            "background-color": theme["dark"],
            "color": theme["white"],
            "border-color":  theme["primary"] + ' !important',
        },
        exporter: {
            "background": theme["dark"],
            "color": theme["white"],
        },
        customizeButton: {
            "background-color": theme["success"],
            "color": theme["dark"],
        },
        loadFromLibraryButton: {
            "background-color": theme["secondary"],
            "color": theme["white"],
        },
        tableButton: {
            "background-color": theme["light"],
            "color": theme["white"],
            "border-color": theme["white"],
        },
        adviseButton: {
            "background-color": theme["primary"],
            "color": theme["dark"],
        },
        resimulateButton: {
            "background-color": theme["warning"],
            "color": theme["dark"],
        },
        resimulateButtonUpToDate: {
            "background-color": theme["secondary"],
            "color": theme["white"],
        },
        showAlignmentOptionsButton: {
            "background-color": theme["primary"],
            "color": theme["dark"],
        },
        showInsulationOptionsButton: {
            "background-color": theme["primary"],
            "color": theme["dark"],
        },
        hideAlignmentOptionsButton: {
            "background-color": theme["secondary"],
            "color": theme["white"],
        },
        hideInsulationOptionsButton: {
            "background-color": theme["secondary"],
            "color": theme["white"],
        },
        coilVisualizerButton: {
            "background-color": theme["primary"],
            "color": theme["dark"],
        },
        wireVisualizerButton: {
            "background-color": "transparent",
            "color": theme["white"],
            "display": ['-webkit-slider-thumb']
        },
        graphBgColor:{
            "background-color": theme["light"],
        },
        graphLineColor:{
            "color": theme["white"],
        },
        graphPointsColor:{
            "color": theme["danger"],
        },

        propertyBgColor:{
            "color": theme["dark"],
        },
        requirementButton: {
            "background-color": theme["light"],
            "color": theme["white"],
            "border-color": theme["white"],
        },


        inputFontSize: {
            // "font-size": '2rem',
            "font-size": '1rem',
        },
        inputTitleFontSize: {
            // "font-size": '2.5rem',
            "font-size": '1.25rem',
        },
        inputLabelBgColor:{
            "background-color": theme["dark"] + ' !important',
            "background-image": "none !important",
        },
        inputLabelDangerBgColor:{
            "color": theme["danger"],
        },
        inputValueBgColor:{
            "background-color": theme["light"],
        },
        inputTextColor:{
            "color": theme["white"],
        },
        inputSelectedTextColor:{
            "color": theme["success"],
        },
        inputErrorTextColor:{
            "color": theme["danger"],
        },
        addButton: {
            "background-color": theme["primary"],
            "color": theme["dark"],
        },
        utilityButton: {
            "background-color": theme["secondary"],
            "color": theme["white"],
        },
        removeButton: {
            "background-color": theme["danger"],
            "color": theme["dark"],
        },
        addElementButtonColor: {
            "color": theme["secondary"],
        },
        removeElementButtonColor: {
            "color": theme["danger"],
        },
        visualizerButtonColor: {
            "color": theme["white"],
        },
    });

    const controlPanel = ref({
        main: {
            "background": theme["dark"],
            "color": theme["white"],
        },
        button: {
            "background": theme["primary"],
            "color": theme["dark"],
        },
        activeButton: {
            "background": theme["info"],
            "color": theme["white"],
        },
        setting: {
            "background": theme["dark"],
            "color": theme["white"],
        },
        closeButton: {
            "background": theme["primary"],
            "color": theme["dark"],
            "border-color":  theme["primary"] + ' !important',
        },
    });

    const contextMenu = ref({
        main: {
            "background": theme["dark"],
            "color": theme["white"],
            "border-color":  theme["primary"] + ' !important',
        },
        settingsButton: {
            "background": theme["info"],
            "color": theme["dark"],
        },
        editButton: {
            "background": theme["success"],
            "color": theme["dark"],
        },
        redrawButton: {
            "background": theme["success"],
            "color": theme["dark"],
        },
        resimulateButton: {
            "background": theme["warning"],
            "color": theme["dark"],
        },
        confirmButton: {
            "background": theme["success"],
            "color": theme["dark"],
        },
        cancelButton: {
            "background": theme["danger"],
            "color": theme["dark"],
        },
        changeToolButton: {
            "background": theme["secondary"],
            "color": theme["white"],
        },
        customizeCoreSectionButton: {
            "background": theme["secondary"],
            "color": theme["white"],
        },
        orderButton: {
            "background": theme["primary"],
            "color": theme["dark"],
        },
        setting: {
            "background": theme["dark"],
            "color": theme["white"],
        },
        closeButton: {
            "background": theme["primary"],
            "color": theme["dark"],
            "border-color":  theme["primary"] + ' !important',
        },
    });


    return {
        engineLoader,
        storyline,
        designRequirements,
        operatingPoints,
        magneticBuilder,
        controlPanel,
        contextMenu,
    }
},
{
    persist: false,
})
