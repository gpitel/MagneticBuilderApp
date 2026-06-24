<template>
    <div class="container-flex ">
        <footer class="py-1 mt-1">
            <ul class="nav justify-content-center border-bottom pb-1 mb-1">
                <li class="nav-item"><a data-cy="Footer-home-link" href="/" class="nav-link px-2 text-color-secondary">Home</a></li>
                <li class="nav-item"><a data-cy="Footer-cookie-policy-link" href="/cookie_policy" class="nav-link px-2 text-color-secondary">Cookie Policy</a></li>
                <li class="nav-item"><a data-cy="Footer-legal-link" href="/legal_notice" class="nav-link px-2 text-color-secondary">Legal</a></li>
            </ul>
            <p class="text-center text-color-secondary m-1">© 2022-{{new Date().getFullYear()}} Open Magnetics</p>
        </footer>
    </div>
</template>
