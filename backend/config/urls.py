"""Root URL configuration for PharmaCare+."""

from django.contrib import admin
from django.urls import include, path

from accounts import (
    admin_api,
    collection_api,
    management_api,
    patients_api,
    prescriptions_api,
    research_api,
    screening,
    stock_api,
    views as account_views,
)

urlpatterns = [
    # Sign-in endpoints used by the login pages.
    path("api/auth/", include("accounts.urls")),

    # Prescription screening against the trained models.
    path("api/screen/", screening.screen_prescription, name="screen"),
    path("api/drugs/", screening.drug_lookup, name="drug-lookup"),

    # A written second opinion (calls the Anthropic API server-side).
    path("api/screen/second-opinion/", screening.second_opinion, name="second-opinion"),

    # Patient files. The same endpoints serve admin, doctors and pharmacy —
    # each request decides what that account may do, so there is one record
    # rather than three copies of it.
    path("api/patients/", patients_api.list_patients, name="patients"),
    path("api/patients/upload/", patients_api.upload_file, name="patient-upload"),
    path("api/patients/files/", patients_api.list_files, name="patient-files"),
    path("api/patients/files/<int:file_id>/read/", patients_api.read_file, name="patient-file-read"),
    path("api/patients/files/<int:file_id>/extract/", patients_api.extract_file, name="patient-file-extract"),
    path("api/patients/files/<int:file_id>/download/", patients_api.download_file, name="patient-file-download"),
    path("api/patients/<str:file_number>/", patients_api.patient_detail, name="patient-detail"),
    path("api/patients/<str:file_number>/save/", patients_api.update_patient, name="patient-save"),
    path("api/patients/<str:file_number>/confirm/", patients_api.confirm_patient, name="patient-confirm"),
    path("api/patients/<str:file_number>/versions/<int:version_id>/", patients_api.version_detail, name="patient-version"),

    # Prescriptions. The doctor writes, the server grades, the pharmacy reads
    # that grading and the reason the doctor gave for going past it.
    path("api/prescriptions/", prescriptions_api.listing, name="prescriptions"),
    path("api/prescriptions/new/", prescriptions_api.create, name="prescription-new"),
    path("api/prescriptions/screen/", prescriptions_api.screen_only, name="prescription-screen"),
    path("api/prescriptions/<str:reference>/", prescriptions_api.detail, name="prescription-detail"),
    path("api/prescriptions/<str:reference>/dispense/", prescriptions_api.dispense, name="prescription-dispense"),
    path("api/prescriptions/<str:reference>/query/", prescriptions_api.query_back, name="prescription-query"),

    # Collection. The counter arms a code, the patient confirms it.
    path("api/prescriptions/<str:reference>/arm/", collection_api.arm, name="collection-arm"),
    path("api/prescriptions/<str:reference>/collection/", collection_api.state, name="collection-state"),
    path("api/prescriptions/<str:reference>/collection/cancel/", collection_api.stand_down, name="collection-cancel"),
    path("api/prescriptions/<str:reference>/collection/code/", collection_api.confirm_by_code, name="collection-code"),

    # The patient's side. No account — the token in the link is the credential.
    path("collect/<str:link_token>/", collection_api.collect_page, name="collect"),
    # The QR encodes this address, so a patient who scans with their phone's
    # own camera app lands on the same page and it confirms for them. The
    # in-page scanner recognises it too.
    path("collect/<str:link_token>/confirm/<str:qr_token>/", collection_api.collect_page, name="collect-scanned"),
    path("api/collect/<str:link_token>/", collection_api.collect_state, name="collect-state"),
    path("api/collect/<str:link_token>/confirm/<str:qr_token>/", collection_api.confirm_by_scan, name="collect-confirm"),

    # Pharmacy stock. The doctor's medicine list reads the same endpoint, so
    # what can be prescribed is what is actually on the shelf.
    path("api/stock/", stock_api.list_stock, name="stock"),
    path("api/stock/<int:item_id>/order/", stock_api.reorder, name="stock-order"),
    path("api/stock/<int:item_id>/movements/", stock_api.movements, name="stock-movements"),

    # Admin workspace overview.
    path("api/admin/overview/", admin_api.overview, name="admin-overview"),

    # Research workspace: profile a dataset, then train on it.
    path("api/research/profile/", research_api.profile_dataset, name="research-profile"),
    path("api/research/train/", research_api.train_model, name="research-train"),

    # The review queue. A decision here changes what later screening runs say,
    # so this is the way clinical knowledge gets back into the system.
    path("api/research/review/", research_api.list_reviews, name="research-review"),
    path("api/research/review/<int:item_id>/", research_api.decide_review, name="research-review-decide"),

    # Raised from the ward or the pharmacy rather than the research workspace.
    path("api/review/raise/", research_api.raise_review, name="review-raise"),

    # Trained models, and which one the prescribing check uses.
    path("api/research/models/", research_api.list_models, name="research-models"),
    path("api/research/models/<int:model_id>/promote/", research_api.promote_model, name="research-model-promote"),
    path("api/research/models/<int:model_id>/retire/", research_api.retire_model, name="research-model-retire"),
    path("api/research/models/<int:model_id>/delete/", research_api.delete_model, name="research-model-delete"),

    # Shared settings. The review threshold decides what the server queues.
    path("api/research/settings/", research_api.get_settings, name="research-settings"),
    path("api/research/settings/save/", research_api.save_settings, name="research-settings-save"),

    # IT support portal: accounts, dashboard, support requests.
    path("api/management/overview/", management_api.overview, name="mgmt-overview"),
    path("api/management/activity/", management_api.activity, name="mgmt-activity"),
    path("api/management/accounts/", management_api.list_accounts, name="mgmt-accounts"),
    path("api/management/accounts/new/", management_api.create_account, name="mgmt-account-new"),
    path("api/management/accounts/suggest-id/", management_api.suggest_id, name="mgmt-suggest-id"),
    path("api/management/accounts/<str:user_id>/", management_api.update_account, name="mgmt-account-update"),
    path("api/management/accounts/<str:user_id>/access/", management_api.set_access, name="mgmt-account-access"),
    path("api/management/accounts/<str:user_id>/password/", management_api.reset_password, name="mgmt-account-password"),
    path("api/management/accounts/<str:user_id>/delete/", management_api.delete_account, name="mgmt-account-delete"),
    path("api/management/tickets/", management_api.list_tickets, name="mgmt-tickets"),
    path("api/management/tickets/<int:ticket_id>/status/", management_api.set_ticket_status, name="mgmt-ticket-status"),

    # Any workspace can raise a support request from its own support section.
    path("api/support/raise/", management_api.raise_ticket, name="support-raise"),

    # Public site and sign in.
    path("", account_views.landing, name="landing"),
    path("login/", account_views.login_page, name="login"),

    # Role workspaces. Each one turns away anybody with the wrong role.
    path("admin/", account_views.admin_workspace, name="admin-workspace"),
    path("staff/", account_views.staff_workspace, name="staff-workspace"),
    path("pharmacy/", account_views.pharmacy_workspace, name="pharmacy-workspace"),
    path("research/", account_views.research_workspace, name="research-workspace"),

    # IT support portal.
    path("management/login/", account_views.management_login, name="management-login"),
    path("management/", account_views.management_portal, name="management-portal"),

    # Django's own admin, moved aside so /admin/ can be the admin workspace.
    path("django-admin/", admin.site.urls),
]