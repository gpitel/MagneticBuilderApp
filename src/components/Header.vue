<script setup >
import { defineAsyncComponent } from "vue";
import { useMasStore } from '/src/stores/mas'

</script>

<script>

export default {
    components: {
        BugReporterModal: defineAsyncComponent(() => import('/src/components/BugReporter.vue') ),
    },
    data() {
        const masStore = useMasStore();
        return {
            masStore,
            bugReporterVisible: false,
            navCollapseOpen: false,
        }
    },
    methods: {
        async newPowerMagneticToolDesign() {
            this.$stateStore.resetMagneticTool();
            this.masStore.resetMas("design");
            await this.$nextTick();
            if (this.$route.name != 'MagneticBuilder')
                await this.$router.push('/magnetic_tool');
            else
                await this.$router.go();
        },
        async continueMagneticToolDesign() {
            await this.$nextTick();
            if (this.$route.name != 'MagneticBuilder')
                await this.$router.push('/magnetic_tool');
            else
                await this.$router.go();
        },
    },
}
</script>

<template>
    <nav class="navbar navbar-expand-lg bg-dark navbar-dark text-primary mb-1 om-header" id="header_wrapper">
        <div class="container-fluid">
            <a data-cy="Header-logo-home-link" href="/" aria-label="Visit OpenMagnetics and Tear Down the Paywalls!">
                <img src="/images/newLogo.png" width="60" height="40" href="/" class="d-inline-block align-top mr-3" alt="OpenMagnetics Logo">
            </a>
            <a  data-cy="Header-brand-home-link" class="navbar-brand text-primary" href="/">OpenMagnetics's Magnetic Builder</a>
            <button class="navbar-toggler text-primary" type="button" @click="navCollapseOpen = !navCollapseOpen" aria-controls="navbarNavDropdown" :aria-expanded="navCollapseOpen ? 'true' : 'false'" aria-label="Toggle navigation">
            <span class="navbar-toggler-icon text-white"></span>
            </button>
            <div class="collapse navbar-collapse" :class="{ show: navCollapseOpen }" id="navbarNavDropdown">
                <ul class="navbar-nav">
                    <li class="nav-item">
                        <a data-cy="Header-alfs-musings-link" class="nav-link text-primary mr-3" href="https://www.linkedin.com/newsletters/7026708624966135808/" target="_blank" rel="noopener noreferrer">Alf's Musings</a>
                    </li>
                    <li class="nav-item">
                        <span class="nav-item">
                            <button data-cy="Header-new-magnetic-link" class="btn mr-4 nav-link text-dark bg-primary border-dark" @click="newPowerMagneticToolDesign">New magnetic<i class="ml-2 pi pi-briefcase"></i> </button>
                        </span>
                    </li>
                    <li v-if="$stateStore.isAnyDesignLoaded() && $route.name != 'MagneticTool'" class="nav-item">
                        <span class="nav-item">
                            <button data-cy="Header-donate-link" class="btn mr-4 nav-link text-dark bg-primary border-dark" @click="continueMagneticToolDesign">Continue design<i class="ml-2 pi pi-box-seam"></i> </button>
                        </span>
                    </li>
                </ul>
                <ul class="navbar-nav ms-auto">
                    <li class="nav-item">
                        <span class="nav-item">
                            <a data-cy="Header-donate-link" href="https://en.liberapay.com/OpenMagnetics/" target="_blank" rel="noopener noreferrer" class="btn mr-4 nav-link text-dark bg-info border-dark">Donate to OM <i class="pi pi-dollar"></i> </a>
                        </span>
                    </li>
                    <li class="nav-item">
                        <span class="nav-item">
                            <button data-cy="Header-report-bug-modal-button" class="btn mr-4 nav-link text-danger border-dark" @click="bugReporterVisible = true">Report bug <i class="pi pi-server"></i> </button>
                        </span>
                    </li>
                    <li class="nav-item">
                        <span class="nav-item">
                            <a data-cy="Header-repository-link" class="btn mr-4 nav-link text-success border-dark" href="https://github.com/OpenMagnetics/" target="_blank" rel="noopener noreferrer">Beta <i class="pi pi-github"></i> </a>
                        </span>
                    </li>
                </ul>
            </div>

        </div>
    </nav>

    <!-- Modal -->
    <BugReporterModal v-model:visible="bugReporterVisible"/>
</template>

<style>

    html {
      position: relative;
      min-height: 100%;
      padding-bottom:160px;
    }

    .om-header {
        min-width: 100%;
        position: fixed;
        z-index: 999;
    }


    @media (max-width: 340px) {
        #title {
            display : none;
        }
    }

    body {
        background-color: var(--p-dark) !important;
    }
    .border-dark {
        border-color: var(--p-dark) !important;
    }
    .input-group-text{
        background-color: var(--p-light) !important;
        color: var(--p-white) !important;
        border-color: var(--p-dark) !important;
    }
    .custom-select,
    .form-control {
        background-color: var(--p-dark) !important;
        color: var(--p-white) !important;
        border-color: var(--p-dark) !important;
    }
    .jumbotron{
        border-radius: 1em;
        box-shadow: 0 5px 10px rgba(var(--p-black-rgb), .2);
    }
    .card{
        padding: 1.5em .5em .5em;
        background-color: var(--p-light);
        border-radius: 1em;
        text-align: center;
        box-shadow: 0 5px 10px rgba(var(--p-black-rgb), .2);
    }
    .form-control:disabled {
        background-color: var(--p-dark) !important;
        color: var(--p-white) !important;
        border-color: var(--p-dark) !important;
    }
    .form-control:-webkit-autofill,
    .form-control:-webkit-autofill:focus,
    .form-control:-webkit-autofill{
        -webkit-text-fill-color: var(--p-white) !important;
        background-color: transparent !important;
        -webkit-box-shadow: 0 0 0 50px var(--p-dark) inset;
    }

    .container {
        max-width: 100vw;
        align-items: center;
    }

    .main {
      margin-top: 60px;
    }
    ::-webkit-scrollbar { height: 3px;}
    ::-webkit-scrollbar-button {  background-color: var(--p-light); }
    ::-webkit-scrollbar-track {  background-color: var(--p-light);}
    ::-webkit-scrollbar-track-piece { background-color: var(--p-dark);}
    ::-webkit-scrollbar-thumb {  background-color: var(--p-light); border-radius: 3px;}
    ::-webkit-scrollbar-corner { background-color: var(--p-light);}

    .small-text {
       font-size: calc(1rem + 0.1vw);
    }
    .medium-text {
       font-size: calc(0.8rem + 0.4vw);
    }
    .large-text {
       font-size: calc(1rem + 0.5vw);
    }

    .accordion-button:focus {
        border-color: var(--p-primary) !important;
        outline: 0  !important;
        box-shadow: none  !important;
    }

</style>
